const STORAGE_KEY = 'openai-compatible-web-chat';
const DEFAULT_BASE_URL = '/v1';
const DEFAULT_PROXY_BASE_URL = '';
const DEFAULT_THEME = 'light';
const DEFAULT_REASONING_EFFORT = 'auto';
const MAX_RECENT_MODELS = 8;
const MAX_QUICK_MODELS = 12;

const state = {
  settings: {
    baseUrl: DEFAULT_BASE_URL,
    apiKey: '',
    model: '',
    temperature: 0.7,
    maxTokens: '',
    rememberKey: false,
    streamMode: true,
    theme: DEFAULT_THEME,
    reasoningEffort: DEFAULT_REASONING_EFFORT,
    settingsCollapsed: false,
    recentModels: []
  },
  conversations: [],
  activeConversationId: null,
  pendingAttachments: [],
  availableModels: [],
  conversationSearch: '',
  sending: false
};

const elements = {
  baseUrlInput: document.getElementById('baseUrlInput'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  modelInput: document.getElementById('modelInput'),
  themeInput: document.getElementById('themeInput'),
  reasoningEffortInput: document.getElementById('reasoningEffortInput'),
  temperatureInput: document.getElementById('temperatureInput'),
  maxTokensInput: document.getElementById('maxTokensInput'),
  rememberKeyInput: document.getElementById('rememberKeyInput'),
  streamModeInput: document.getElementById('streamModeInput'),
  toggleSettingsBtn: document.getElementById('toggleSettingsBtn'),
  settingsPanel: document.querySelector('.settings-panel'),
  settingsBody: document.getElementById('settingsBody'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  unlockBaseUrlBtn: document.getElementById('unlockBaseUrlBtn'),
  openApiSiteBtn: document.getElementById('openApiSiteBtn'),
  loadModelsBtn: document.getElementById('loadModelsBtn'),
  modelsSelect: document.getElementById('modelsSelect'),
  quickModelList: document.getElementById('quickModelList'),
  clearRecentModelsBtn: document.getElementById('clearRecentModelsBtn'),
  newChatBtn: document.getElementById('newChatBtn'),
  deleteChatBtn: document.getElementById('deleteChatBtn'),
  conversationSearchInput: document.getElementById('conversationSearchInput'),
  conversationList: document.getElementById('conversationList'),
  chatTitle: document.getElementById('chatTitle'),
  statusText: document.getElementById('statusText'),
  modelBadge: document.getElementById('modelBadge'),
  messagesContainer: document.getElementById('messagesContainer'),
  dropZone: document.getElementById('messagesDropZone'),
  dropHint: document.getElementById('dropHint'),
  fileInput: document.getElementById('fileInput'),
  attachmentList: document.getElementById('attachmentList'),
  messageInput: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn'),
  exportJsonBtn: document.getElementById('exportJsonBtn'),
  exportMarkdownBtn: document.getElementById('exportMarkdownBtn'),
  themeToggleBtn: document.getElementById('themeToggleBtn')
};

function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatTime(value) {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function setStatus(text) {
  elements.statusText.textContent = text;
}

function setModelBadge(model) {
  const reasoningLabel = getReasoningEffortLabel(state.settings.reasoningEffort);
  const suffix = reasoningLabel ? ` · 推理 ${reasoningLabel}` : '';
  elements.modelBadge.textContent = `当前请求模型：${model || '未发送'}${suffix}`;
}

function normalizeBaseUrlValue(value) {
  const normalized = String(value || '').trim();
  return normalized || DEFAULT_PROXY_BASE_URL || DEFAULT_BASE_URL;
}

function normalizeApiBaseUrl(value) {
  const normalized = normalizeBaseUrlValue(value).replace(/\/+$/, '');

  if (normalized.startsWith('/')) {
    return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
  }

  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error('API 地址必须以 http://、https:// 或 / 开头');
  }

  return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
}

function getApiHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
}

function buildApiRequestBody(requestBody) {
  const { baseUrl, apiKey, reasoning_effort, max_tokens, ...apiRequestBody } = requestBody;

  if (typeof max_tokens === 'number' && Number.isFinite(max_tokens) && max_tokens > 0) {
    apiRequestBody.max_tokens = max_tokens;
  }

  if (typeof reasoning_effort === 'string' && reasoning_effort && reasoning_effort !== 'auto') {
    apiRequestBody.reasoning_effort = reasoning_effort;
  }

  return apiRequestBody;
}

function setBaseUrlEditState(unlocked) {
  elements.baseUrlInput.readOnly = !unlocked;
  elements.baseUrlInput.dataset.unlocked = unlocked ? 'true' : 'false';
  if (elements.unlockBaseUrlBtn) {
    elements.unlockBaseUrlBtn.textContent = unlocked ? '锁定' : '自定义';
  }
}

function unlockBaseUrlInput() {
  const unlocked = elements.baseUrlInput.dataset.unlocked === 'true';
  if (unlocked) {
    state.settings.baseUrl = normalizeBaseUrlValue(elements.baseUrlInput.value);
    syncSettingsToInputs();
    setBaseUrlEditState(false);
    saveState();
    setStatus('已锁定 API 地址');
    return;
  }

  setBaseUrlEditState(true);
  elements.baseUrlInput.focus();
  elements.baseUrlInput.select();
  setStatus('已解锁 API 地址，可输入自定义地址');
}

function openApiSite() {
  window.open('https://aiapi.setbug.cn', '_blank', 'noopener,noreferrer');
}

function normalizeTheme(value) {
  return ['light', 'dark'].includes(value) ? value : DEFAULT_THEME;
}

function normalizeReasoningEffort(value) {
  return ['low', 'medium', 'high'].includes(value) ? value : DEFAULT_REASONING_EFFORT;
}

function normalizeRecentModels(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, MAX_RECENT_MODELS);
}

function normalizeConversation(rawConversation) {
  return {
    id: rawConversation?.id || uid('chat'),
    title: rawConversation?.title || '新对话',
    createdAt: rawConversation?.createdAt || new Date().toISOString(),
    updatedAt: rawConversation?.updatedAt || rawConversation?.createdAt || new Date().toISOString(),
    requestModel: rawConversation?.requestModel || '',
    messages: Array.isArray(rawConversation?.messages) ? rawConversation.messages : []
  };
}

function getActiveConversation() {
  return state.conversations.find((item) => item.id === state.activeConversationId) || null;
}

function applyTheme(theme) {
  const normalizedTheme = normalizeTheme(theme);
  document.documentElement.dataset.theme = normalizedTheme;
  document.documentElement.style.colorScheme = normalizedTheme;

  if (elements.themeToggleBtn) {
    const nextThemeIsDark = normalizedTheme === 'light';
    elements.themeToggleBtn.textContent = nextThemeIsDark ? '🌙' : '☀️';
    elements.themeToggleBtn.setAttribute('aria-label', nextThemeIsDark ? '切换到暗色主题' : '切换到亮色主题');
    elements.themeToggleBtn.title = nextThemeIsDark ? '切换到暗色主题' : '切换到亮色主题';
  }
}

function applySettingsCollapseState() {
  elements.settingsPanel.classList.toggle('collapsed', Boolean(state.settings.settingsCollapsed));
  elements.toggleSettingsBtn.textContent = state.settings.settingsCollapsed ? '展开' : '折叠';
  elements.toggleSettingsBtn.setAttribute('aria-expanded', String(!state.settings.settingsCollapsed));
}

function isCloudflareHostedPage() {
  return window.location.hostname.endsWith('.workers.dev');
}

function shouldUseDefaultProxy(baseUrl) {
  return isCloudflareHostedPage() && (!baseUrl || baseUrl === 'https://aiapi.setbug.cn' || baseUrl === 'https://aiapi.setbug.cn/v1');
}

function migrateBaseUrlForCurrentHost() {
  if (shouldUseDefaultProxy(state.settings.baseUrl)) {
    state.settings.baseUrl = DEFAULT_BASE_URL;
  }
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    migrateBaseUrlForCurrentHost();
    createConversation();
    syncSettingsToInputs();
    applyTheme(state.settings.theme);
    applySettingsCollapseState();
    render();
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.settings = {
      ...state.settings,
      ...parsed.settings,
      theme: normalizeTheme(parsed?.settings?.theme),
      reasoningEffort: normalizeReasoningEffort(parsed?.settings?.reasoningEffort),
      settingsCollapsed: Boolean(parsed?.settings?.settingsCollapsed),
      recentModels: normalizeRecentModels(parsed?.settings?.recentModels)
    };
    state.conversations = Array.isArray(parsed.conversations)
      ? parsed.conversations.map(normalizeConversation)
      : [];
    state.activeConversationId = parsed.activeConversationId || null;
    migrateBaseUrlForCurrentHost();
  } catch {
    createConversation();
  }

  if (!state.conversations.length) {
    createConversation();
  }

  if (!state.conversations.some((item) => item.id === state.activeConversationId)) {
    state.activeConversationId = state.conversations[0].id;
  }

  syncSettingsToInputs();
  applyTheme(state.settings.theme);
  applySettingsCollapseState();
  render();
}

function saveState() {
  const payload = {
    settings: {
      ...state.settings,
      apiKey: state.settings.rememberKey ? state.settings.apiKey : '',
      recentModels: normalizeRecentModels(state.settings.recentModels)
    },
    conversations: state.conversations,
    activeConversationId: state.activeConversationId
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function syncSettingsFromInputs() {
  state.settings.baseUrl = normalizeBaseUrlValue(elements.baseUrlInput.value);
  state.settings.apiKey = elements.apiKeyInput.value.trim();
  state.settings.model = elements.modelInput.value.trim();
  state.settings.theme = normalizeTheme(elements.themeInput.value);
  state.settings.reasoningEffort = normalizeReasoningEffort(elements.reasoningEffortInput.value);
  state.settings.temperature = Number(elements.temperatureInput.value || 0.7);
  state.settings.maxTokens = elements.maxTokensInput.value.trim();
  state.settings.rememberKey = elements.rememberKeyInput.checked;
  state.settings.streamMode = elements.streamModeInput.checked;
}

function syncSettingsToInputs() {
  elements.baseUrlInput.value = normalizeBaseUrlValue(state.settings.baseUrl);
  elements.apiKeyInput.value = state.settings.apiKey || '';
  elements.modelInput.value = state.settings.model || '';
  elements.themeInput.value = normalizeTheme(state.settings.theme);
  elements.reasoningEffortInput.value = normalizeReasoningEffort(state.settings.reasoningEffort);
  elements.temperatureInput.value = String(state.settings.temperature ?? 0.7);
  elements.maxTokensInput.value = state.settings.maxTokens || '';
  elements.rememberKeyInput.checked = Boolean(state.settings.rememberKey);
  elements.streamModeInput.checked = state.settings.streamMode !== false;
  setBaseUrlEditState(false);
}

function createConversation() {
  const conversation = normalizeConversation({
    id: uid('chat'),
    title: '新对话',
    requestModel: '',
    messages: []
  });

  state.conversations.unshift(conversation);
  state.activeConversationId = conversation.id;
  state.pendingAttachments = [];
  saveState();
  render();
  return conversation;
}

function addRecentModel(model) {
  const normalizedModel = String(model || '').trim();
  if (!normalizedModel) {
    return;
  }

  state.settings.recentModels = [
    normalizedModel,
    ...state.settings.recentModels.filter((item) => item !== normalizedModel)
  ].slice(0, MAX_RECENT_MODELS);
}

function setSelectedModel(model, options = {}) {
  const normalizedModel = String(model || '').trim();
  elements.modelInput.value = normalizedModel;
  state.settings.model = normalizedModel;

  if (normalizedModel) {
    addRecentModel(normalizedModel);
  }

  renderQuickModels();

  if (options.persist !== false) {
    saveState();
  }

  if (options.statusMessage) {
    setStatus(options.statusMessage);
  }
}

function getQuickModels() {
  const deduped = [];

  for (const model of state.settings.recentModels) {
    if (!deduped.includes(model)) {
      deduped.push(model);
    }
  }

  for (const model of state.availableModels) {
    if (!deduped.includes(model)) {
      deduped.push(model);
    }
    if (deduped.length >= MAX_QUICK_MODELS) {
      break;
    }
  }

  return deduped.slice(0, MAX_QUICK_MODELS);
}

function getReasoningEffortLabel(value) {
  if (value === 'low') {
    return 'Low';
  }

  if (value === 'medium') {
    return 'Medium';
  }

  if (value === 'high') {
    return 'High';
  }

  return '';
}

function renderQuickModels() {
  const quickModels = getQuickModels();
  elements.quickModelList.innerHTML = '';

  if (!quickModels.length) {
    elements.quickModelList.innerHTML = '<div class="empty-inline">还没有可快速切换的模型</div>';
    return;
  }

  for (const model of quickModels) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `quick-model-chip${model === state.settings.model ? ' active' : ''}`;
    button.textContent = model;
    button.addEventListener('click', () => {
      setSelectedModel(model, { statusMessage: `已切换模型：${model}` });
      render();
    });
    elements.quickModelList.appendChild(button);
  }
}

function updateConversationTitle(conversation) {
  if (!conversation || conversation.title !== '新对话') {
    return;
  }

  const firstUserMessage = conversation.messages.find((message) => message.role === 'user');
  if (!firstUserMessage) {
    return;
  }

  const content = extractMessageText(firstUserMessage.content).trim();
  conversation.title = content.slice(0, 24) || '新对话';
}

function matchesConversationSearch(conversation, keyword) {
  if (!keyword) {
    return true;
  }

  const haystack = [
    conversation.title,
    conversation.requestModel,
    ...conversation.messages.map((message) => extractMessageText(message.content))
  ]
    .join('\n')
    .toLowerCase();

  return haystack.includes(keyword);
}

function getConversationPreview(conversation) {
  const lastMessage = [...conversation.messages].reverse().find((message) => extractMessageText(message.content).trim());
  if (!lastMessage) {
    return '暂无消息';
  }

  const text = extractMessageText(lastMessage.content).replace(/\s+/g, ' ').trim();
  return text.slice(0, 48) || '暂无消息';
}

function renderConversationList() {
  elements.conversationList.innerHTML = '';

  const keyword = state.conversationSearch.trim().toLowerCase();
  const sorted = [...state.conversations]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .filter((conversation) => matchesConversationSearch(conversation, keyword));

  if (!sorted.length) {
    elements.conversationList.innerHTML = '<div class="empty-inline">没有匹配的对话记录</div>';
    return;
  }

  for (const conversation of sorted) {
    const button = document.createElement('button');
    button.className = `conversation-item${conversation.id === state.activeConversationId ? ' active' : ''}`;
    button.type = 'button';
    button.innerHTML = `
      <span class="conversation-item-title">${escapeHtml(conversation.title)}</span>
      <span class="conversation-item-snippet">${escapeHtml(getConversationPreview(conversation))}</span>
      <span class="conversation-item-time">${formatTime(conversation.updatedAt)}</span>
    `;
    button.addEventListener('click', () => {
      state.activeConversationId = conversation.id;
      render();
      saveState();
    });
    elements.conversationList.appendChild(button);
  }
}

function renderMessages() {
  const conversation = getActiveConversation();
  elements.messagesContainer.innerHTML = '';

  if (!conversation || !conversation.messages.length) {
    elements.messagesContainer.innerHTML = `
      <div class="empty-state">
        <div>
          <h2>开始聊天</h2>
          <p>输入问题后点击发送，系统会自动保留上下文，实现连续对话。</p>
        </div>
      </div>
    `;
    return;
  }

  for (const message of conversation.messages) {
    const wrapper = document.createElement('article');
    wrapper.className = `message ${message.role}`;

    const label = message.role === 'user' ? '你' : 'AI';
    const modelMeta = message.role === 'assistant' && message.requestModel ? ` · ${escapeHtml(message.requestModel)}` : '';
    wrapper.innerHTML = `
      <div class="message-header">${label} · ${formatTime(message.createdAt)}${modelMeta}</div>
      <div class="message-body">${renderMessageBody(message)}</div>
    `;

    elements.messagesContainer.appendChild(wrapper);
  }

  elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

function renderMessageBody(message) {
  const text = extractMessageText(message.content);
  const renderedText = message.role === 'assistant' ? renderMarkdown(text) : renderPlainText(text);
  const previews = [];

  if (Array.isArray(message.attachments) && message.attachments.length) {
    for (const file of message.attachments) {
      if (file.kind === 'image') {
        previews.push(`
          <div class="attachment-preview-item">
            <strong>${escapeHtml(file.name)}</strong>
            <img src="${file.dataUrl}" alt="${escapeHtml(file.name)}" />
          </div>
        `);
      } else {
        previews.push(`
          <div class="attachment-preview-item">
            <strong>${escapeHtml(file.name)}</strong>
            <div>${escapeHtml(file.preview || '已附带文本内容')}</div>
          </div>
        `);
      }
    }
  }

  return `
    <div class="message-text">${renderedText || ''}</div>
    ${previews.length ? `<div class="attachment-preview">${previews.join('')}</div>` : ''}
  `;
}

function renderAttachments() {
  elements.attachmentList.innerHTML = '';

  for (const item of state.pendingAttachments) {
    const chip = document.createElement('div');
    chip.className = 'attachment-chip';
    chip.innerHTML = `
      <span>${escapeHtml(item.name)}</span>
      <button type="button" aria-label="移除附件">×</button>
    `;
    chip.querySelector('button').addEventListener('click', () => {
      state.pendingAttachments = state.pendingAttachments.filter((file) => file.id !== item.id);
      renderAttachments();
    });
    elements.attachmentList.appendChild(chip);
  }
}

function render() {
  const conversation = getActiveConversation();
  elements.chatTitle.textContent = conversation?.title || '新对话';
  setModelBadge(conversation?.requestModel || state.settings.model || '');
  applyTheme(state.settings.theme);
  applySettingsCollapseState();
  renderQuickModels();
  renderConversationList();
  renderMessages();
  renderAttachments();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeHtmlPreservingSpaces(value) {
  return escapeHtml(value).replace(/  /g, ' &nbsp;');
}

function formatMathText(value) {
  const greekLetters = {
    alpha: 'α',
    beta: 'β',
    gamma: 'γ',
    delta: 'δ',
    epsilon: 'ε',
    theta: 'θ',
    lambda: 'λ',
    mu: 'μ',
    pi: 'π',
    rho: 'ρ',
    sigma: 'σ',
    tau: 'τ',
    phi: 'φ',
    omega: 'ω',
    chi: 'χ',
    Delta: 'Δ',
    Gamma: 'Γ',
    Lambda: 'Λ',
    Pi: 'Π',
    Sigma: 'Σ',
    Phi: 'Φ',
    Omega: 'Ω'
  };
  const operators = {
    cdot: '·',
    times: '×',
    pm: '±',
    mp: '∓',
    leq: '≤',
    geq: '≥',
    neq: '≠',
    approx: '≈',
    to: '→',
    rightarrow: '→',
    leftarrow: '←',
    leftrightarrow: '↔',
    infty: '∞'
  };

  return String(value || '')
    .trim()
    .replace(/\\\\/g, '\n')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\left\b/g, '')
    .replace(/\\right\b/g, '')
    .replace(/\\([A-Za-z]+)\b/g, (match, command) => operators[command] || greekLetters[command] || match)
    .replace(/\^\{([^{}]+)\}/g, '^$1')
    .replace(/_\{([^{}]+)\}/g, '_$1')
    .replace(/\\[,;:]/g, ' ')
    .replace(/\\!/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n');
}

function renderMathInline(expression) {
  return `<span class="math-inline">${escapeHtml(formatMathText(expression))}</span>`;
}

function renderMathBlock(expression) {
  const lines = formatMathText(expression)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return '';
  }

  return `<div class="math-block">${lines
    .map((line) => `<div class="math-line">${escapeHtml(line)}</div>`)
    .join('')}</div>`;
}

function restoreHtmlTokens(text, tokens, prefix) {
  return tokens.reduce((result, token, index) => result.replaceAll(`${prefix}${index}@@`, token), text);
}

function renderInlineMarkdown(text) {
  const mathTokens = [];
  const normalizedText = String(text || '').replace(/\\\(([\s\S]+?)\\\)/g, (_, expression) => {
    const token = `@@MATH${mathTokens.length}@@`;
    mathTokens.push(renderMathInline(expression));
    return token;
  });

  let result = escapeHtml(normalizedText);
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
  return restoreHtmlTokens(result, mathTokens, '@@MATH');
}

function renderPlainText(text) {
  const escaped = escapeHtmlPreservingSpaces(text || '');
  const paragraphs = escaped.split(/\n{2,}/).map((part) => part.replace(/\n/g, '<br />'));
  return paragraphs.map((part) => `<p>${part}</p>`).join('');
}

function renderMarkdown(markdownText) {
  const text = String(markdownText || '');
  const parts = text.split(/```/);
  const htmlParts = [];

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (index % 2 === 1) {
      const firstLineBreak = part.indexOf('\n');
      const language = firstLineBreak >= 0 ? part.slice(0, firstLineBreak).trim() : '';
      const code = firstLineBreak >= 0 ? part.slice(firstLineBreak + 1) : part;
      const languageLabel = language ? `${escapeHtml(language)}\n` : '';
      htmlParts.push(`<pre><code>${languageLabel}${escapeHtml(code)}</code></pre>`);
      continue;
    }

    htmlParts.push(renderMarkdownParagraphs(part));
  }

  return htmlParts.join('');
}

function consumeMathBlock(lines, startIndex) {
  const line = lines[startIndex];
  const trimmed = line.trim();
  const delimiters = trimmed.startsWith('\\[')
    ? { open: '\\[', close: '\\]' }
    : trimmed.startsWith('$$')
      ? { open: '$$', close: '$$' }
      : null;

  if (!delimiters) {
    return null;
  }

  const openIndex = line.indexOf(delimiters.open);
  const afterOpen = line.slice(openIndex + delimiters.open.length);
  const closeIndexOnSameLine = afterOpen.indexOf(delimiters.close);

  if (closeIndexOnSameLine >= 0) {
    return {
      html: renderMathBlock(afterOpen.slice(0, closeIndexOnSameLine)),
      nextIndex: startIndex
    };
  }

  const buffer = [];
  if (afterOpen.trim()) {
    buffer.push(afterOpen);
  }

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const currentLine = lines[index];
    const closeIndex = currentLine.indexOf(delimiters.close);

    if (closeIndex >= 0) {
      const beforeClose = currentLine.slice(0, closeIndex);
      if (beforeClose.trim()) {
        buffer.push(beforeClose);
      }
      return {
        html: renderMathBlock(buffer.join('\n')),
        nextIndex: index
      };
    }

    buffer.push(currentLine);
  }

  return null;
}

function renderMarkdownParagraphs(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const html = [];
  let paragraph = [];
  let listType = null;
  let tableBuffer = [];

  function flushParagraph() {
    if (!paragraph.length) {
      return;
    }
    const paragraphText = renderInlineMarkdown(paragraph.join('\n')).replace(/\n/g, '<br />');
    html.push(`<p>${paragraphText}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!listType) {
      return;
    }
    html.push(`</${listType}>`);
    listType = null;
  }

  function flushTable() {
    if (!tableBuffer.length) {
      return;
    }

    const rows = tableBuffer
      .filter((line) => line.includes('|'))
      .map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));

    if (rows.length >= 2) {
      const header = rows[0];
      const body = rows.slice(2);
      html.push('<table><thead><tr>');
      for (const cell of header) {
        html.push(`<th>${renderInlineMarkdown(cell)}</th>`);
      }
      html.push('</tr></thead><tbody>');
      for (const row of body) {
        html.push('<tr>');
        for (const cell of row) {
          html.push(`<td>${renderInlineMarkdown(cell)}</td>`);
        }
        html.push('</tr>');
      }
      html.push('</tbody></table>');
    } else {
      for (const line of tableBuffer) {
        paragraph.push(escapeHtmlPreservingSpaces(line));
      }
    }

    tableBuffer = [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.includes('|') && /^\|?.+\|.+\|?$/.test(trimmed)) {
      flushParagraph();
      flushList();
      tableBuffer.push(line);
      continue;
    }

    if (tableBuffer.length) {
      flushTable();
    }

    const mathBlock = consumeMathBlock(lines, index);
    if (mathBlock) {
      flushParagraph();
      flushList();
      if (mathBlock.html) {
        html.push(mathBlock.html);
      }
      index = mathBlock.nextIndex;
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    if (/^#{1,6}\s/.test(trimmed)) {
      flushParagraph();
      flushList();
      const level = trimmed.match(/^#+/)[0].length;
      const content = trimmed.replace(/^#{1,6}\s*/, '');
      html.push(`<h${level}>${renderInlineMarkdown(content)}</h${level}>`);
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      flushList();
      html.push(`<blockquote>${renderInlineMarkdown(trimmed.replace(/^>\s?/, ''))}</blockquote>`);
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
        html.push('<ul>');
      }
      html.push(`<li>${renderInlineMarkdown(unorderedMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
        html.push('<ol>');
      }
      html.push(`<li>${renderInlineMarkdown(orderedMatch[1])}</li>`);
      continue;
    }

    flushList();
    paragraph.push(escapeHtmlPreservingSpaces(line));
  }

  flushTable();
  flushParagraph();
  flushList();

  return html.join('');
}

function extractMessageText(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part.type === 'text') {
          return part.text || '';
        }

        if (part.type === 'image_url') {
          return '[图片附件]';
        }

        return '';
      })
      .join('\n');
  }

  return '';
}

async function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`读取文件失败：${file.name}`));
    reader.readAsText(file, 'utf-8');
  });
}

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`读取图片失败：${file.name}`));
    reader.readAsDataURL(file);
  });
}

function isTextLikeFile(file) {
  const textExtensions = [
    '.txt', '.md', '.json', '.csv', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.xml', '.yml', '.yaml', '.py', '.java', '.go', '.rs', '.sql', '.sh', '.log'
  ];

  return file.type.startsWith('text/') || textExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));
}

async function handleFiles(files) {
  const nextItems = [];

  for (const file of files) {
    if (file.type.startsWith('image/')) {
      const dataUrl = await readFileAsDataUrl(file);
      nextItems.push({
        id: uid('file'),
        name: file.name,
        size: file.size,
        kind: 'image',
        dataUrl,
        preview: '图片附件'
      });
      continue;
    }

    if (isTextLikeFile(file)) {
      const text = await readFileAsText(file);
      nextItems.push({
        id: uid('file'),
        name: file.name,
        size: file.size,
        kind: 'text',
        text,
        preview: `${text.slice(0, 120)}${text.length > 120 ? '...' : ''}`
      });
      continue;
    }

    nextItems.push({
      id: uid('file'),
      name: file.name,
      size: file.size,
      kind: 'unsupported',
      preview: '该文件类型不会自动解析内容，只会附带文件信息。'
    });
  }

  state.pendingAttachments = [...state.pendingAttachments, ...nextItems];
  renderAttachments();
  setStatus(`已添加 ${nextItems.length} 个附件`);
}

function buildUserContent(text, attachments) {
  const normalizedText = text.trim();
  const textFiles = attachments.filter((item) => item.kind === 'text');
  const imageFiles = attachments.filter((item) => item.kind === 'image');
  const otherFiles = attachments.filter((item) => item.kind === 'unsupported');

  let mergedText = normalizedText;

  if (textFiles.length) {
    const fileBlocks = textFiles.map((file) => `\n\n--- 文件：${file.name} ---\n${file.text}`);
    mergedText += `${mergedText ? '\n\n' : ''}以下是我上传的文件内容，请结合它们回答：${fileBlocks.join('')}`;
  }

  if (otherFiles.length) {
    const fileInfo = otherFiles.map((file) => `- ${file.name}（${file.size} bytes）`).join('\n');
    mergedText += `${mergedText ? '\n\n' : ''}我还上传了这些未解析文件，请只把它们当作参考信息：\n${fileInfo}`;
  }

  if (!imageFiles.length) {
    return mergedText;
  }

  const content = [];
  if (mergedText) {
    content.push({ type: 'text', text: mergedText });
  }

  for (const file of imageFiles) {
    content.push({
      type: 'image_url',
      image_url: {
        url: file.dataUrl
      }
    });
  }

  return content;
}

function getRequestMessages(conversation, assistantMessageId) {
  return conversation.messages
    .filter((message) => message.id !== assistantMessageId)
    .map((message) => ({
      role: message.role,
      content: message.content
    }));
}

function extractAssistantText(payload) {
  const choice = payload?.choices?.[0];
  const message = choice?.message;

  if (typeof choice?.text === 'string') {
    return choice.text;
  }

  if (!message) {
    throw new Error('接口返回中没有 choices[0].message');
  }

  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message
      .content
      .map((item) => item?.text || item?.content || '')
      .join('\n')
      .trim();
  }

  if (typeof message.reasoning_content === 'string') {
    return message.reasoning_content;
  }

  return JSON.stringify(message.content, null, 2);
}

function extractStreamDelta(json) {
  const choice = json?.choices?.[0];
  const delta = choice?.delta;

  if (typeof delta?.content === 'string') {
    return delta.content;
  }

  if (Array.isArray(delta?.content)) {
    return delta.content.map((item) => item?.text || item?.content || '').join('');
  }

  if (typeof delta?.reasoning_content === 'string') {
    return delta.reasoning_content;
  }

  if (typeof choice?.message?.content === 'string') {
    return choice.message.content;
  }

  if (Array.isArray(choice?.message?.content)) {
    return choice.message.content.map((item) => item?.text || item?.content || '').join('');
  }

  if (typeof choice?.message?.reasoning_content === 'string') {
    return choice.message.reasoning_content;
  }

  if (typeof choice?.text === 'string') {
    return choice.text;
  }

  return '';
}

function parseStreamEventPayload(payload) {
  if (!payload) {
    return null;
  }

  const lines = payload
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

  let eventName = 'message';
  const dataLines = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  return {
    eventName,
    data: dataLines.join('\n')
  };
}

function splitStreamSegments(buffer) {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const segments = normalized.split(/\n\n+/);
  return {
    segments: segments.slice(0, -1),
    remainder: segments.at(-1) || ''
  };
}

function handleStreamSegment(segment, assistantMessage) {
  const parsed = parseStreamEventPayload(segment);
  if (!parsed || !parsed.data) {
    return;
  }

  if (parsed.eventName === 'error') {
    try {
      const errorPayload = JSON.parse(parsed.data);
      throw new Error(errorPayload.error || '流式响应出错');
    } catch (error) {
      throw error instanceof Error ? error : new Error('流式响应出错');
    }
  }

  if (parsed.data === '[DONE]') {
    return;
  }

  let json;
  try {
    json = JSON.parse(parsed.data);
  } catch {
    return;
  }

  const delta = extractStreamDelta(json);
  if (delta) {
    appendAssistantDelta(assistantMessage, delta);
  }
}

function appendAssistantDelta(message, delta) {
  message.content = `${extractMessageText(message.content)}${delta}`;
  render();
}

async function sendWithStandardRequest(requestBody, conversation, assistantMessage) {
  const response = await fetch(`${normalizeApiBaseUrl(requestBody.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: getApiHeaders(requestBody.apiKey),
    body: JSON.stringify(buildApiRequestBody(requestBody))
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || '请求失败');
  }

  const assistantText = extractAssistantText(payload);
  assistantMessage.content = assistantText;
  assistantMessage.requestModel = state.settings.model;
  conversation.requestModel = assistantMessage.requestModel;
  setModelBadge(conversation.requestModel);
}

async function sendWithStream(requestBody, conversation, assistantMessage) {
  const response = await fetch(`${normalizeApiBaseUrl(requestBody.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: getApiHeaders(requestBody.apiKey),
    body: JSON.stringify(buildApiRequestBody({ ...requestBody, stream: true }))
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error || '流式请求失败');
  }

  if (!response.body) {
    throw new Error('浏览器不支持流式响应');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const result = splitStreamSegments(buffer);
    buffer = result.remainder;

    for (const segment of result.segments) {
      handleStreamSegment(segment, assistantMessage);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    handleStreamSegment(buffer, assistantMessage);
  }
}

async function sendMessage() {
  if (state.sending) {
    return;
  }

  syncSettingsFromInputs();
  applyTheme(state.settings.theme);

  if (!state.settings.baseUrl || !state.settings.apiKey || !state.settings.model) {
    setStatus('请先填写 API 地址、API Key 和模型名');
    if (state.settings.settingsCollapsed) {
      state.settings.settingsCollapsed = false;
      saveState();
      applySettingsCollapseState();
    }
    return;
  }

  const inputText = elements.messageInput.value;
  if (!inputText.trim() && !state.pendingAttachments.length) {
    setStatus('请输入消息或上传文件');
    return;
  }

  addRecentModel(state.settings.model);
  saveState();

  const conversation = getActiveConversation() || createConversation();
  const attachments = [...state.pendingAttachments];
  const userContent = buildUserContent(inputText, attachments);

  if (!extractMessageText(userContent).trim() && !attachments.some((item) => item.kind === 'image')) {
    setStatus('附件内容为空，无法发送');
    return;
  }

  const userMessage = {
    id: uid('msg'),
    role: 'user',
    content: userContent,
    createdAt: new Date().toISOString(),
    attachments
  };

  const assistantMessage = {
    id: uid('msg'),
    role: 'assistant',
    content: '',
    createdAt: new Date().toISOString(),
    attachments: [],
    requestModel: state.settings.model
  };

  conversation.messages.push(userMessage);
  conversation.messages.push(assistantMessage);
  conversation.updatedAt = new Date().toISOString();
  conversation.requestModel = state.settings.model;
  updateConversationTitle(conversation);

  state.pendingAttachments = [];
  elements.messageInput.value = '';
  autoResizeTextarea();
  state.sending = true;
  elements.sendBtn.classList.add('loading');
  elements.sendBtn.disabled = true;
  setStatus(state.settings.streamMode ? 'AI 正在流式输出...' : 'AI 正在思考...');
  render();
  saveState();

  const requestBody = {
    baseUrl: state.settings.baseUrl,
    apiKey: state.settings.apiKey,
    model: state.settings.model,
    temperature: state.settings.temperature,
    max_tokens: state.settings.maxTokens ? Number(state.settings.maxTokens) : undefined,
    reasoning_effort: state.settings.reasoningEffort,
    messages: getRequestMessages(conversation, assistantMessage.id)
  };

  try {
    if (state.settings.streamMode) {
      try {
        await sendWithStream(requestBody, conversation, assistantMessage);
        if (!extractMessageText(assistantMessage.content).trim()) {
          setStatus('流式输出为空，已自动切换普通模式');
          await sendWithStandardRequest(requestBody, conversation, assistantMessage);
        }
      } catch (streamError) {
        if (extractMessageText(assistantMessage.content)) {
          throw streamError;
        }

        setStatus(`流式输出不可用，已自动切换普通模式：${streamError.message}`);
        await sendWithStandardRequest(requestBody, conversation, assistantMessage);
      }
    } else {
      await sendWithStandardRequest(requestBody, conversation, assistantMessage);
    }

    conversation.updatedAt = new Date().toISOString();
    setStatus('回复完成');
    saveState();
    render();
  } catch (error) {
    conversation.messages = conversation.messages.filter((message) => message.id !== assistantMessage.id);
    conversation.updatedAt = new Date().toISOString();
    saveState();
    render();
    setStatus(`发送失败：${error.message}`);
  } finally {
    state.sending = false;
    elements.sendBtn.classList.remove('loading');
    elements.sendBtn.disabled = false;
    renderAttachments();
  }
}

function deleteCurrentConversation() {
  if (state.conversations.length === 1) {
    state.conversations = [];
    createConversation();
    return;
  }

  state.conversations = state.conversations.filter((item) => item.id !== state.activeConversationId);
  state.activeConversationId = state.conversations[0]?.id || null;
  state.pendingAttachments = [];
  saveState();
  render();
  setStatus('已删除当前对话');
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportCurrentConversationAsJson() {
  const conversation = getActiveConversation();
  if (!conversation) {
    setStatus('当前没有可导出的对话');
    return;
  }

  downloadFile(
    `${conversation.title || 'chat'}.json`,
    JSON.stringify(conversation, null, 2),
    'application/json;charset=utf-8'
  );
}

function exportCurrentConversationAsMarkdown() {
  const conversation = getActiveConversation();
  if (!conversation) {
    setStatus('当前没有可导出的对话');
    return;
  }

  const markdown = [
    `# ${conversation.title}`,
    '',
    `- 创建时间：${formatTime(conversation.createdAt)}`,
    `- 更新时间：${formatTime(conversation.updatedAt)}`,
    `- 请求模型：${conversation.requestModel || state.settings.model || '未知'}`,
    `- 推理强度：${getReasoningEffortLabel(state.settings.reasoningEffort) || '自动 / 关闭'}`,
    ''
  ];

  for (const message of conversation.messages) {
    markdown.push(`## ${message.role === 'user' ? '用户' : 'AI'}`);
    markdown.push('');
    markdown.push(extractMessageText(message.content) || '(空)');
    markdown.push('');

    if (Array.isArray(message.attachments) && message.attachments.length) {
      markdown.push('### 附件');
      markdown.push('');
      for (const file of message.attachments) {
        markdown.push(`- ${file.name} (${file.kind})`);
      }
      markdown.push('');
    }
  }

  downloadFile(`${conversation.title || 'chat'}.md`, markdown.join('\n'), 'text/markdown;charset=utf-8');
}

async function loadModels() {
  syncSettingsFromInputs();
  if (!state.settings.baseUrl || !state.settings.apiKey) {
    setStatus('请先填写 API Key');
    if (state.settings.settingsCollapsed) {
      state.settings.settingsCollapsed = false;
      saveState();
      applySettingsCollapseState();
    }
    return;
  }

  setStatus('正在获取模型列表...');
  elements.loadModelsBtn.disabled = true;

  try {
    const response = await fetch(`${normalizeApiBaseUrl(state.settings.baseUrl)}/models`, {
      method: 'GET',
      headers: getApiHeaders(state.settings.apiKey)
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || '读取模型失败');
    }

    const models = Array.isArray(payload.data) ? payload.data : [];
    state.availableModels = models.map((model) => model.id).filter(Boolean);
    elements.modelsSelect.innerHTML = '<option value="">请选择模型</option>';

    for (const modelId of state.availableModels) {
      const option = document.createElement('option');
      option.value = modelId;
      option.textContent = modelId;
      option.selected = modelId === state.settings.model;
      elements.modelsSelect.appendChild(option);
    }

    renderQuickModels();
    setStatus(`已读取 ${state.availableModels.length} 个模型`);
  } catch (error) {
    setStatus(`获取模型失败：${error.message}`);
  } finally {
    elements.loadModelsBtn.disabled = false;
  }
}

function autoResizeTextarea() {
  elements.messageInput.style.height = 'auto';
  elements.messageInput.style.height = `${Math.min(elements.messageInput.scrollHeight, 300)}px`;
}

function toggleTheme() {
  state.settings.theme = state.settings.theme === 'light' ? 'dark' : 'light';
  applyTheme(state.settings.theme);
  syncSettingsToInputs();
  saveState();
  render();
  setStatus(`已切换到${state.settings.theme === 'light' ? '亮色' : '暗色'}主题`);
}

function saveSettings() {
  syncSettingsFromInputs();
  if (state.settings.model) {
    addRecentModel(state.settings.model);
  }
  saveState();
  setBaseUrlEditState(false);
  render();
  setStatus('设置已保存到本地浏览器');
}

function clearRecentModels() {
  state.settings.recentModels = [];
  saveState();
  renderQuickModels();
  setStatus('已清空快速切换模型记录');
}

function toggleSettingsPanel() {
  state.settings.settingsCollapsed = !state.settings.settingsCollapsed;
  saveState();
  applySettingsCollapseState();
  setStatus(state.settings.settingsCollapsed ? '已折叠连接设置' : '已展开连接设置');
}

function preventBrowserOpenOnDrop(event) {
  event.preventDefault();
  event.stopPropagation();
}

function bindDragAndDrop() {
  ['dragenter', 'dragover'].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      preventBrowserOpenOnDrop(event);
      elements.dropZone.classList.add('dragover');
      elements.dropHint.textContent = '松开鼠标即可上传文件';
    });
  });

  ['dragleave', 'dragend', 'drop'].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      preventBrowserOpenOnDrop(event);
      elements.dropZone.classList.remove('dragover');
      elements.dropHint.textContent = '拖拽文件到聊天区域即可上传';
    });
  });

  elements.dropZone.addEventListener('drop', async (event) => {
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) {
      return;
    }

    try {
      await handleFiles(files);
    } catch (error) {
      setStatus(error.message);
    }
  });

  document.addEventListener('dragover', preventBrowserOpenOnDrop);
  document.addEventListener('drop', preventBrowserOpenOnDrop);
}

function bindEvents() {
  elements.toggleSettingsBtn.addEventListener('click', toggleSettingsPanel);
  elements.saveSettingsBtn.addEventListener('click', saveSettings);
  elements.unlockBaseUrlBtn.addEventListener('click', unlockBaseUrlInput);
  elements.openApiSiteBtn.addEventListener('click', openApiSite);
  elements.loadModelsBtn.addEventListener('click', loadModels);
  elements.clearRecentModelsBtn.addEventListener('click', clearRecentModels);
  elements.modelsSelect.addEventListener('change', (event) => {
    if (event.target.value) {
      setSelectedModel(event.target.value, { statusMessage: `已选择模型：${event.target.value}` });
      render();
    }
  });
  elements.modelInput.addEventListener('blur', () => {
    const value = elements.modelInput.value.trim();
    if (!value) {
      return;
    }
    setSelectedModel(value, { persist: false });
  });
  elements.themeInput.addEventListener('change', () => {
    syncSettingsFromInputs();
    applyTheme(state.settings.theme);
    saveState();
    render();
    setStatus(`已切换到${state.settings.theme === 'light' ? '亮色' : '暗色'}主题`);
  });
  elements.reasoningEffortInput.addEventListener('change', () => {
    syncSettingsFromInputs();
    saveState();
    render();
    setStatus(`推理强度已设置为：${getReasoningEffortLabel(state.settings.reasoningEffort) || '自动 / 关闭'}`);
  });
  elements.streamModeInput.addEventListener('change', saveSettings);
  elements.conversationSearchInput.addEventListener('input', (event) => {
    state.conversationSearch = event.target.value || '';
    renderConversationList();
  });
  elements.newChatBtn.addEventListener('click', () => {
    createConversation();
    setStatus('已新建对话');
  });
  elements.deleteChatBtn.addEventListener('click', deleteCurrentConversation);
  elements.fileInput.addEventListener('change', async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    try {
      await handleFiles(files);
    } catch (error) {
      setStatus(error.message);
    } finally {
      event.target.value = '';
    }
  });
  elements.sendBtn.addEventListener('click', sendMessage);
  elements.themeToggleBtn.addEventListener('click', toggleTheme);
  elements.exportJsonBtn.addEventListener('click', exportCurrentConversationAsJson);
  elements.exportMarkdownBtn.addEventListener('click', exportCurrentConversationAsMarkdown);
  elements.messageInput.addEventListener('input', autoResizeTextarea);
  elements.messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  bindDragAndDrop();
}

bindEvents();
loadState();
autoResizeTextarea();
renderQuickModels();
