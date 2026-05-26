export default {
  title: "Persona",
  subtitle: "Edit soul, memory, and user profile files",
  edit: "Edit",
  save: "Save",
  saving: "Saving…",
  placeholder: {
    soul: "Write your agent's persona instructions here...",
    memory: "Agent memory entries (separated by §)",
    user: "Describe yourself here — your preferences, context, and background...",
  },
  hint: {
    soul: "This file is loaded fresh for every conversation. Define your agent's personality, tone, and standing instructions.",
    memory: "Agent's accumulated memory across conversations. Entries are separated by § delimiters.",
    user: "Your user profile — describe your preferences, role, and context. The agent uses this to personalize responses.",
  },
} as const;
