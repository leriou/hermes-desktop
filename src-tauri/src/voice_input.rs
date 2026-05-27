use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use whisper_rs::{WhisperContext, WhisperContextParameters, FullParams, SamplingStrategy};

use crate::python;

const MODEL_FILENAME: &str = "ggml-base.bin";
const SAMPLE_RATE: u32 = 16000;
const MAX_RECORDING_SECS: u32 = 60;
const VAD_SILENCE_SECS: u32 = 3;
const VAD_CHUNK_MS: u32 = 100;
const VAD_ENERGY_THRESHOLD: f32 = 0.0004;

pub static VOICE_STOPPED: AtomicBool = AtomicBool::new(false);

/// cpal::Stream is !Send on macOS (tied to creating thread's CoreAudio run loop).
/// We create it on the main thread during setup, then use play()/pause() which
/// Apple documents as safe to call from any thread.
struct SendableStream(cpal::Stream);
unsafe impl Send for SendableStream {}
unsafe impl Sync for SendableStream {}

pub struct VoiceState {
    pub recording: bool,
    pub samples: Vec<f32>,
    sample_rate: u32,
    ctx: Option<Arc<WhisperContext>>,
    /// Audio stream created on the main thread during app setup.
    stream: Option<SendableStream>,
}

impl VoiceState {
    pub fn new() -> Self {
        Self {
            recording: false,
            samples: Vec::new(),
            sample_rate: SAMPLE_RATE,
            ctx: None,
            stream: None,
        }
    }
}

#[derive(Clone, Copy)]
enum InputSampleFormat {
    F32,
    I16,
    U16,
}

struct InputStreamSpec {
    config: cpal::StreamConfig,
    sample_format: InputSampleFormat,
}

fn model_dir() -> PathBuf {
    let home = python::get_hermes_home::<tauri::Wry>(None);
    home.join("models").join("whisper")
}

fn model_path() -> PathBuf {
    model_dir().join(MODEL_FILENAME)
}

/// Remove any stale files (tmp downloads, partial files) from the whisper model directory.
/// Only keeps the expected model file; everything else is garbage.
pub fn clean_stale_files() {
    let dir = model_dir();
    if !dir.is_dir() {
        return;
    }
    let expected = model_path();
    let Ok(entries) = std::fs::read_dir(&dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path == expected {
            continue;
        }
        // Only touch regular files — never delete subdirectories
        if path.is_file() {
            eprintln!("[voice] Cleaning stale file: {}", path.display());
            let _ = std::fs::remove_file(&path);
        }
    }
}

pub fn voice_model_status() -> Result<serde_json::Value, String> {
    // Random ~10% chance to trigger stale file cleanup on status check
    if std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
        .is_multiple_of(10)
    {
        clean_stale_files();
    }

    let path = model_path();
    let exists = path.exists();
    let size = if exists {
        std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };
    Ok(serde_json::json!({
        "downloaded": exists,
        "path": path.to_string_lossy(),
        "size": size,
    }))
}

pub async fn voice_download_model(app: tauri::AppHandle) -> Result<(), String> {
    let dir = model_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let path = model_path();
    if path.exists() {
        clean_stale_files();
        return Ok(());
    }

    clean_stale_files();

    let url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";
    let tmp_path = path.with_extension("bin.tmp");
    let total: u64 = 74_000_000;

    // Progress reporter — polls temp file size while curl downloads
    let tmp_clone = tmp_path.clone();
    let app_clone = app.clone();
    let progress = tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            let downloaded = std::fs::metadata(&tmp_clone).map(|m| m.len()).unwrap_or(0);
            let pct = (downloaded as f64 / total as f64 * 100.0).min(100.0) as u32;
            let _ = app_clone.emit("voice-download-progress", serde_json::json!({ "percent": pct }));
            if downloaded >= total { break; }
        }
    });

    let status = tokio::time::timeout(
        std::time::Duration::from_secs(300),
        tokio::process::Command::new("curl")
            .args(["-L", "-s", "-S", "--proto", "=https", "--max-time", "240", "-o"])
            .arg(&tmp_path)
            .arg(url)
            .status()
    )
    .await
    .map_err(|e| {
        progress.abort();
        let _ = std::fs::remove_file(&tmp_path);
        format!("Voice model download timed out: {}", e)
    })?
    .map_err(|e| {
        progress.abort();
        let _ = std::fs::remove_file(&tmp_path);
        format!("Failed to start curl: {}", e)
    })?;

    progress.abort();

    if !status.success() {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(format!("Download failed: curl exited with {}", status));
    }

    std::fs::rename(&tmp_path, &path).map_err(|e| e.to_string())?;
    Ok(())
}

fn load_model() -> Result<Arc<WhisperContext>, String> {
    let path = model_path();
    if !path.exists() {
        return Err("Whisper model not downloaded. Run voice_download_model first.".into());
    }
    let params = WhisperContextParameters { use_gpu: true, ..Default::default() };
    let ctx = WhisperContext::new_with_params(&path.to_string_lossy(), params)
        .map_err(|e| format!("Failed to load whisper model: {}", e))?;
    Ok(Arc::new(ctx))
}

pub fn voice_start(state: &Arc<Mutex<VoiceState>>) -> Result<(), String> {
    use cpal::traits::StreamTrait;

    let mut s = state.lock().map_err(|e| e.to_string())?;
    if s.recording {
        return Err("Already recording".into());
    }

    if s.ctx.is_none() {
        let ctx = load_model()?;
        s.ctx = Some(ctx);
    }

    // Lazy-init audio stream on first use — avoids segfault during app startup
    if s.stream.is_none() {
        drop(s);
        init_audio(state);
        s = state.lock().map_err(|e| e.to_string())?;
        if s.stream.is_none() {
            return Err("Audio stream not initialized".into());
        }
    }

    s.samples.clear();
    s.recording = true;
    VOICE_STOPPED.store(false, Ordering::SeqCst);

    if let Some(ref stream) = s.stream {
        stream
            .0
            .play()
            .map_err(|e| format!("Failed to start recording: {}", e))?;
    }

    Ok(())
}

pub fn stop_recording(state: &Arc<Mutex<VoiceState>>) -> Result<(Arc<WhisperContext>, Vec<f32>, u32), String> {
    use cpal::traits::StreamTrait;

    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.recording = false;

    if let Some(ref stream) = s.stream {
        let _ = stream.0.pause();
    }

    let samples = std::mem::take(&mut s.samples);
    let sample_rate = s.sample_rate;
    let ctx = s.ctx.as_ref().ok_or("No whisper context")?.clone();
    Ok((ctx, samples, sample_rate))
}

pub fn voice_stop_and_transcribe(state: &Arc<Mutex<VoiceState>>) -> Result<String, String> {
    let (ctx, samples, sample_rate) = stop_recording(state)?;
    if samples.is_empty() {
        return Ok(String::new());
    }

    let whisper_samples = resample_to_16khz(&samples, sample_rate);
    transcribe(&ctx, &whisper_samples)
}

fn choose_input_stream_spec(device: &cpal::Device) -> Result<InputStreamSpec, String> {
    use cpal::traits::DeviceTrait;

    let default_config = device
        .default_input_config()
        .map_err(|e| format!("Failed to read default input config: {}", e))?;
    let sample_format = match default_config.sample_format() {
        cpal::SampleFormat::F32 => InputSampleFormat::F32,
        cpal::SampleFormat::I16 => InputSampleFormat::I16,
        cpal::SampleFormat::U16 => InputSampleFormat::U16,
        other => return Err(format!("Unsupported input sample format: {:?}", other)),
    };
    Ok(InputStreamSpec {
        config: default_config.config(),
        sample_format,
    })
}

fn push_input_samples<T>(state: &Arc<Mutex<VoiceState>>, data: &[T], channels: usize)
where
    T: Copy + IntoSampleF32,
{
    let mut s = match state.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    if !s.recording {
        return;
    }

    if channels <= 1 {
        s.samples.extend(data.iter().map(|sample| sample.into_sample_f32()));
    } else {
        for frame in data.chunks(channels) {
            if let Some(sample) = frame.first() {
                s.samples.push(sample.into_sample_f32());
            }
        }
    }

    let input_sample_rate = s.sample_rate.max(1) as usize;
    let max_samples = input_sample_rate * MAX_RECORDING_SECS as usize;
    if s.samples.len() >= max_samples {
        s.recording = false;
        VOICE_STOPPED.store(true, Ordering::SeqCst);
        return;
    }

    let chunk_size = (input_sample_rate * VAD_CHUNK_MS as usize) / 1000;
    let silence_chunks = (VAD_SILENCE_SECS as usize * 1000) / VAD_CHUNK_MS as usize;
    if s.samples.len() > chunk_size * silence_chunks {
        let tail = &s.samples[s.samples.len() - chunk_size * silence_chunks..];
        let energy: f32 = tail.iter().map(|&x| x * x).sum::<f32>() / (tail.len() as f32);
        if energy < VAD_ENERGY_THRESHOLD {
            s.recording = false;
            VOICE_STOPPED.store(true, Ordering::SeqCst);
        }
    }
}

fn resample_to_16khz(samples: &[f32], input_rate: u32) -> Vec<f32> {
    if input_rate == SAMPLE_RATE || samples.is_empty() {
        return samples.to_vec();
    }
    let ratio = input_rate as f64 / SAMPLE_RATE as f64;
    let output_len = (samples.len() as f64 / ratio).ceil() as usize;
    let mut out = Vec::with_capacity(output_len);
    for i in 0..output_len {
        let src_pos = i as f64 * ratio;
        let lo = src_pos.floor() as usize;
        if lo >= samples.len() {
            break;
        }
        let hi = (lo + 1).min(samples.len() - 1);
        let frac = (src_pos - lo as f64) as f32;
        out.push(samples[lo] * (1.0 - frac) + samples[hi] * frac);
    }
    out
}

trait IntoSampleF32 {
    fn into_sample_f32(self) -> f32;
}

impl IntoSampleF32 for f32 {
    fn into_sample_f32(self) -> f32 {
        self
    }
}

impl IntoSampleF32 for i16 {
    fn into_sample_f32(self) -> f32 {
        self as f32 / i16::MAX as f32
    }
}

impl IntoSampleF32 for u16 {
    fn into_sample_f32(self) -> f32 {
        (self as f32 - 32768.0) / 32768.0
    }
}

fn transcribe(ctx: &WhisperContext, samples: &[f32]) -> Result<String, String> {
    if samples.is_empty() {
        return Ok(String::new());
    }

    let mut state = ctx
        .create_state()
        .map_err(|e| format!("Failed to create whisper state: {}", e))?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some("auto"));
    params.set_translate(false);
    params.set_initial_prompt("Transcribe in the original spoken language. If the spoken language is Chinese, use Simplified Chinese characters.");
    params.set_print_progress(false);
    params.set_print_timestamps(false);
    params.set_print_special(false);

    state
        .full(params, samples)
        .map_err(|e| format!("Whisper transcription failed: {}", e))?;

    let num_segments = state
        .full_n_segments()
        .map_err(|e| format!("Failed to get segments: {}", e))?;

    let mut text = String::new();
    for i in 0..num_segments {
        let seg = state
            .full_get_segment_text(i)
            .map_err(|e| format!("Failed to get segment: {}", e))?;
        let seg = seg.trim();
        if seg.is_empty() || is_non_speech_token(seg) {
            continue;
        }
        if !text.is_empty() {
            text.push(' ');
        }
        text.push_str(seg);
    }

    Ok(normalize_transcript_text(&text))
}

fn normalize_transcript_text(text: &str) -> String {
    text.chars().map(traditional_to_simplified_char).collect()
}

fn traditional_to_simplified_char(ch: char) -> char {
    match ch {
        '臺' => '台',
        '灣' => '湾',
        '國' => '国',
        '語' => '语',
        '漢' => '汉',
        '聲' => '声',
        '體' => '体',
        '轉' => '转',
        '錄' => '录',
        '輸' => '输',
        '簡' => '简',
        '聽' => '听',
        '說' => '说',
        '話' => '话',
        '這' => '这',
        '個' => '个',
        '還' => '还',
        '會' => '会',
        '來' => '来',
        '們' => '们',
        '為' => '为',
        '嗎' => '吗',
        '裡' | '裏' => '里',
        '後' => '后',
        '時' => '时',
        '間' => '间',
        '題' => '题',
        _ => ch,
    }
}

fn is_non_speech_token(seg: &str) -> bool {
    let s = seg.trim().to_ascii_lowercase();
    s.starts_with('[') && s.ends_with(']')
        || matches!(
            s.as_str(),
            "[music]" | "[sound]" | "[noise]" | "[silence]" | "[blank_audio]"
            | "(music)" | "(sound)" | "(noise)" | "(silence)"
        )
}

/// Initialize the audio stream on the main thread during app setup.
/// ALL cpal/CoreAudio operations happen here — build_input_stream internally calls
/// AudioObjectGetPropertyData which segfaults on background threads (macOS 26+).
/// After setup, only play()/pause() are called, which Apple documents as thread-safe.
/// Initialize the audio stream. On macOS, must run on a thread with an active
/// CoreAudio run-loop. We use a dedicated thread that keeps its run-loop alive
/// for the lifetime of the stream — this avoids segfaults that occur when
/// `build_input_stream` is called on Tauri's setup thread (whose run-loop may
/// not yet be pumping when CoreAudio queries it).
pub fn init_audio(state: &Arc<Mutex<VoiceState>>) {
    use cpal::traits::{DeviceTrait, HostTrait};

    eprintln!("[voice] Initializing audio stream on dedicated audio thread...");
    let host = match cpal::default_host() {
        h if h.default_input_device().is_some() => h,
        _ => {
            eprintln!("[voice] WARNING: No audio host or input device found");
            return;
        }
    };
    let device = match host.default_input_device() {
        Some(d) => d,
        None => {
            eprintln!("[voice] WARNING: No audio input device found");
            return;
        }
    };
    eprintln!("[voice] Audio device: {:?}", device.name());

    let spec = match choose_input_stream_spec(&device) {
        Ok(spec) => spec,
        Err(e) => {
            eprintln!("[voice] Failed to choose input stream config: {}", e);
            return;
        }
    };
    eprintln!("[voice] Audio config: {:?}", spec.config);

    let state_clone = state.clone();
    let channels = spec.config.channels as usize;
    let input_sample_rate = spec.config.sample_rate.0;
    if let Ok(mut voice_state) = state.lock() {
        voice_state.sample_rate = input_sample_rate;
    }
    let err_fn = |err: cpal::StreamError| {
            eprintln!("[voice] Audio stream error: {}", err);
    };
    let stream = match spec.sample_format {
        InputSampleFormat::F32 => device.build_input_stream(
            &spec.config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| push_input_samples(&state_clone, data, channels),
            err_fn,
            None,
        ),
        InputSampleFormat::I16 => device.build_input_stream(
            &spec.config,
            move |data: &[i16], _: &cpal::InputCallbackInfo| push_input_samples(&state_clone, data, channels),
            err_fn,
            None,
        ),
        InputSampleFormat::U16 => device.build_input_stream(
            &spec.config,
            move |data: &[u16], _: &cpal::InputCallbackInfo| push_input_samples(&state_clone, data, channels),
            err_fn,
            None,
        ),
    };

    match stream {
        Ok(s) => {
            // Pause immediately — stream only plays when user starts recording
            use cpal::traits::StreamTrait;
            if let Err(e) = s.pause() {
                eprintln!("[voice] WARNING: could not pause initial stream: {}", e);
            }
            let mut voice_state = state.lock().unwrap();
            voice_state.stream = Some(SendableStream(s));
            eprintln!("[voice] Audio stream created successfully (paused)");
        }
        Err(e) => {
            eprintln!("[voice] Failed to create audio stream: {}", e);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resamples_default_macos_input_to_whisper_rate() {
        let input = vec![0.5; 48_000];
        let output = resample_to_16khz(&input, 48_000);

        assert_eq!(output.len(), 16_000);
        assert!(output.iter().all(|sample| (*sample - 0.5).abs() < f32::EPSILON));
    }

    #[test]
    fn leaves_16khz_samples_unchanged() {
        let input = vec![0.25; 16_000];
        let output = resample_to_16khz(&input, 16_000);

        assert_eq!(output, input);
    }

    #[test]
    fn identifies_common_non_speech_tokens() {
        assert!(is_non_speech_token("[music]"));
        assert!(is_non_speech_token("(NOISE)"));
        assert!(!is_non_speech_token("hello world"));
    }

    #[test]
    fn normalizes_common_traditional_chinese_transcript_to_simplified() {
        assert_eq!(
            normalize_transcript_text("這個語音轉錄還會輸出繁體嗎"),
            "这个语音转录还会输出繁体吗",
        );
    }

    #[test]
    fn leaves_non_chinese_transcript_text_unchanged() {
        assert_eq!(
            normalize_transcript_text("Please keep English as English."),
            "Please keep English as English.",
        );
    }

    #[test]
    fn vad_uses_actual_input_sample_rate_before_auto_stop() {
        VOICE_STOPPED.store(false, Ordering::SeqCst);
        let state = Arc::new(Mutex::new(VoiceState {
            recording: true,
            samples: Vec::new(),
            sample_rate: 48_000,
            ctx: None,
            stream: None,
        }));

        push_input_samples(&state, &vec![0.0_f32; 48_001], 1);

        let state = state.lock().unwrap();
        assert!(state.recording);
        assert!(!VOICE_STOPPED.load(Ordering::SeqCst));
    }

    #[test]
    fn vad_does_not_treat_quiet_speech_as_silence() {
        VOICE_STOPPED.store(false, Ordering::SeqCst);
        let state = Arc::new(Mutex::new(VoiceState {
            recording: true,
            samples: Vec::new(),
            sample_rate: 16_000,
            ctx: None,
            stream: None,
        }));

        push_input_samples(&state, &vec![0.03_f32; 48_001], 1);

        let state = state.lock().unwrap();
        assert!(state.recording);
        assert!(!VOICE_STOPPED.load(Ordering::SeqCst));
    }
}
