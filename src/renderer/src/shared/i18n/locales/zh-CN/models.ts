export default {
  title: "模型",
  subtitle: "已接入的模型库。这些模型会出现在聊天页面的模型选择器中。",
  searchPlaceholder: "搜索模型...",
  empty: "还没有模型",
  noMatch: "没有匹配的模型",
  emptyHint:
    "前往 Providers > 模型标签页探测并添加模型，或手动添加自定义模型。",
  addFromProviderHint:
    "要从提供商发现并添加模型，请前往 Providers > 模型标签页。",
  deleteConfirm: "删除？",
  displayName: "显示名称",
  modelId: "模型 ID",
  namePlaceholder: "例如：Claude Sonnet 4",
  modelIdPlaceholder: "例如：anthropic/claude-sonnet-4-20250514",
  baseUrlPlaceholder: "http://localhost:1234/v1",
  addModel: "添加模型",
  editModel: "编辑模型",
  update: "更新",
  deleteModelTitle: "删除模型",
  yes: "是",
  no: "否",
  nameRequired: "名称和模型 ID 为必填项",
  customProviderHint: "仅在自定义或本地提供商时需要填写",
  apiKeyLabel: "API Key",
  apiKeyHint:
    "保存为环境变量。会按 URL 匹配对应的环境变量名，否则使用 CUSTOM_API_KEY。",
  tabs: {
    myModels: "我的模型",
    templates: "模板库",
  },
  templates: {
    subtitle: "内置模型模板，点击可快速添加到你的模型库。",
    alreadyAdded: "已添加",
    quickAdd: "添加",
  },
} as const;
