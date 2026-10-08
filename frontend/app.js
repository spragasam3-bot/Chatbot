/**
 * AI Chatbot Frontend Application Logic
 * =====================================
 * Handles:
 * - Conversation management (list, select, create, clear, delete)
 * - Server-Sent Events (SSE) streaming via fetch ReadableStream
 * - Real-time markdown parsing with Marked.js and DOMPurify
 * - Code syntax highlighting with Highlight.js and clipboard copy
 * - Responsive mobile drawer and modal controls
 * - Settings configuration with localStorage persistence
 */

(function () {
  'use strict';

  // ============================================================================
  // Application State
  // ============================================================================
  const state = {
    activeConversationId: null,
    conversations: [],
    isGenerating: false,
    abortController: null,
    modelsConfig: null,
    settings: {
      model: 'gpt-4o-mini',
      systemPrompt: '',
      temperature: 0.7,
      maxTokens: 2048,
    },
    conversationToDelete: null,
  };

  // ============================================================================
  // DOM Elements Cache
  // ============================================================================
  const DOM = {
    // Sidebar & Navigation
    sidebar: document.getElementById('sidebar'),
    sidebarBackdrop: document.getElementById('sidebarBackdrop'),
    openSidebarBtn: document.getElementById('openSidebarBtn'),
    closeSidebarBtn: document.getElementById('closeSidebarBtn'),
    newChatBtn: document.getElementById('newChatBtn'),
    historyContainer: document.getElementById('historyContainer'),
    historyGroups: document.getElementById('historyGroups'),
    historyLoading: document.getElementById('historyLoading'),
    historyEmpty: document.getElementById('historyEmpty'),
    sidebarModelName: document.getElementById('sidebarModelName'),
    statusDot: document.getElementById('statusDot'),
    openSettingsBtn: document.getElementById('openSettingsBtn'),
    headerSettingsBtn: document.getElementById('headerSettingsBtn'),

    // Chat Header & Area
    currentChatTitle: document.getElementById('currentChatTitle'),
    chatSubtitle: document.getElementById('chatSubtitle'),
    clearChatBtn: document.getElementById('clearChatBtn'),
    apiNoticeBanner: document.getElementById('apiNoticeBanner'),
    dismissBannerBtn: document.getElementById('dismissBannerBtn'),
    messagesContainer: document.getElementById('messagesContainer'),
    messagesList: document.getElementById('messagesList'),
    emptyState: document.getElementById('emptyState'),
    scrollBottomBtn: document.getElementById('scrollBottomBtn'),

    // Input Box
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),

    // Settings Modal
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    modelSelect: document.getElementById('modelSelect'),
    systemPromptInput: document.getElementById('systemPromptInput'),
    resetPromptBtn: document.getElementById('resetPromptBtn'),
    temperatureSlider: document.getElementById('temperatureSlider'),
    temperatureValue: document.getElementById('temperatureValue'),
    maxTokensSlider: document.getElementById('maxTokensSlider'),
    maxTokensValue: document.getElementById('maxTokensValue'),

    // Delete Modal
    deleteModal: document.getElementById('deleteModal'),
    closeDeleteModalBtn: document.getElementById('closeDeleteModalBtn'),
    cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
    confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
    deleteTargetTitle: document.getElementById('deleteTargetTitle'),

    // Clear Modal
    clearModal: document.getElementById('clearModal'),
    closeClearModalBtn: document.getElementById('closeClearModalBtn'),
    cancelClearBtn: document.getElementById('cancelClearBtn'),
    confirmClearBtn: document.getElementById('confirmClearBtn'),

    // Toasts
    toastContainer: document.getElementById('toastContainer'),
  };

  // ============================================================================
  // Initialization
  // ============================================================================
  async function init() {
    loadSettingsFromStorage();
    setupMarkdownOptions();
    bindEventListeners();
    await checkHealthAndModels();
    await loadConversations();
  }

  // ============================================================================
  // Settings Management (Local Storage & API sync)
  // ============================================================================
  function loadSettingsFromStorage() {
    try {
      const saved = localStorage.getItem('ai_chatbot_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        state.settings = { ...state.settings, ...parsed };
      }
    } catch (e) {
      console.warn('Failed to parse saved settings from localStorage', e);
    }
  }

  function saveSettingsToStorage() {
    try {
      localStorage.setItem('ai_chatbot_settings', JSON.stringify(state.settings));
    } catch (e) {
      console.warn('Failed to save settings to localStorage', e);
    }
  }

  async function checkHealthAndModels() {
    try {
      const [healthRes, modelsRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/models'),
      ]);

      if (healthRes.ok) {
        const health = await healthRes.json();
        if (!health.api_key_configured) {
          DOM.apiNoticeBanner.style.display = 'flex';
          DOM.statusDot.classList.add('unconfigured');
        } else {
          DOM.apiNoticeBanner.style.display = 'none';
          DOM.statusDot.classList.remove('unconfigured');
        }
      }

      if (modelsRes.ok) {
        state.modelsConfig = await modelsRes.json();
        // Update models dropdown
        populateModelDropdown(state.modelsConfig.models);
        // Default system prompt if empty
        if (!state.settings.systemPrompt) {
          state.settings.systemPrompt = state.modelsConfig.default_system_prompt || '';
        }
        const validModelIds = (state.modelsConfig.models || []).map((m) => m.id);
        if (!state.settings.model || !validModelIds.includes(state.settings.model)) {
          state.settings.model = state.modelsConfig.default_model || (validModelIds[0] || 'gpt-4o-mini');
          saveSettingsToStorage();
        }
      }
    } catch (err) {
      console.error('Initial configuration fetch failed:', err);
    }

    updateModelDisplay();
  }

  function populateModelDropdown(models) {
    if (!models || !models.length) return;
    DOM.modelSelect.innerHTML = '';
    models.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name || m.id;
      if (m.id === state.settings.model) {
        opt.selected = true;
      }
      DOM.modelSelect.appendChild(opt);
    });
  }

  function updateModelDisplay() {
    if (DOM.sidebarModelName) {
      DOM.sidebarModelName.textContent = state.settings.model;
    }
    if (DOM.chatSubtitle) {
      DOM.chatSubtitle.textContent = `Model: ${state.settings.model}`;
    }
  }

  // ============================================================================
  // Markdown & Syntax Highlighting Engine
  // ============================================================================
  function setupMarkdownOptions() {
    if (typeof marked !== 'undefined') {
      marked.setOptions({
        gfm: true,
        breaks: true,
        pedantic: false,
        sanitize: false, // Handled by DOMPurify
        highlight: function (code, lang) {
          if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
            try {
              return hljs.highlight(code, { language: lang }).value;
            } catch (err) {
              console.error('Highlight.js error:', err);
            }
          }
          if (typeof hljs !== 'undefined') {
            try {
              return hljs.highlightAuto(code).value;
            } catch (err) {}
          }
          return escapeHtml(code);
        },
      });
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function renderMarkdown(rawText) {
    if (!rawText) return '';
    if (typeof marked === 'undefined') {
      // Graceful fallback if CDN fails
      return `<p>${escapeHtml(rawText).replace(/\n/g, '<br/>')}</p>`;
    }
    const html = marked.parse(rawText);
    if (typeof DOMPurify !== 'undefined') {
      return DOMPurify.sanitize(html, {
        ADD_TAGS: ['iframe'],
        ADD_ATTR: ['target', 'rel'],
      });
    }
    return html;
  }

  // Attach copy buttons to rendered code blocks
  function enhanceCodeBlocks(container) {
    const preElements = container.querySelectorAll('pre');
    preElements.forEach((pre) => {
      if (pre.parentElement.classList.contains('code-block-wrapper')) {
        return; // Already wrapped
      }

      const code = pre.querySelector('code');
      let lang = 'code';
      if (code) {
        const match = code.className.match(/language-(\w+)/);
        if (match) {
          lang = match[1];
        }
      }

      // Create code header bar
      const wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';

      const header = document.createElement('div');
      header.className = 'code-block-header';
      header.innerHTML = `
        <span class="code-language">${escapeHtml(lang)}</span>
        <button class="copy-code-btn" type="button" aria-label="Copy code">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>Copy</span>
        </button>
      `;

      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(header);
      wrapper.appendChild(pre);

      // Copy action
      const copyBtn = header.querySelector('.copy-code-btn');
      copyBtn.addEventListener('click', async () => {
        const textToCopy = code ? code.innerText : pre.innerText;
        try {
          await navigator.clipboard.writeText(textToCopy);
          copyBtn.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span style="color: #10b981;">Copied!</span>
          `;
          setTimeout(() => {
            copyBtn.innerHTML = `
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy</span>
            `;
          }, 2000);
        } catch (err) {
          showToast('Failed to copy code to clipboard.', 'error');
        }
      });
    });
  }

  // ============================================================================
  // Conversations Management (Sidebar & Grouping)
  // ============================================================================
  async function loadConversations() {
    DOM.historyLoading.style.display = 'block';
    DOM.historyEmpty.style.display = 'none';
    DOM.historyGroups.innerHTML = '';

    try {
      const res = await fetch('/api/conversations');
      if (!res.ok) throw new Error('Could not retrieve conversation list.');
      state.conversations = await res.json();

      DOM.historyLoading.style.display = 'none';

      if (state.conversations.length === 0) {
        DOM.historyEmpty.style.display = 'block';
        startNewChatSession();
        return;
      }

      renderGroupedConversations();

      // If active conversation is not set, select the most recently updated one
      if (!state.activeConversationId && state.conversations.length > 0) {
        selectConversation(state.conversations[0].id);
      }
    } catch (err) {
      DOM.historyLoading.style.display = 'none';
      console.error('Error fetching conversations:', err);
      showToast('Error loading conversation history', 'error');
    }
  }

  function categorizeDate(isoDateString) {
    if (!isoDateString) return 'Older';
    const date = new Date(isoDateString);
    const now = new Date();

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const sevenDaysAgo = new Date(startOfToday);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (date >= startOfToday) return 'Today';
    if (date >= startOfYesterday) return 'Yesterday';
    if (date >= sevenDaysAgo) return 'Previous 7 Days';
    return 'Older';
  }

  function renderGroupedConversations() {
    DOM.historyGroups.innerHTML = '';

    const groups = {
      'Today': [],
      'Yesterday': [],
      'Previous 7 Days': [],
      'Older': [],
    };

    state.conversations.forEach((conv) => {
      const category = categorizeDate(conv.updated_at);
      if (groups[category]) {
        groups[category].push(conv);
      } else {
        groups['Older'].push(conv);
      }
    });

    for (const [title, list] of Object.entries(groups)) {
      if (list.length === 0) continue;

      const groupSection = document.createElement('div');
      groupSection.className = 'history-group-section';

      const groupTitle = document.createElement('div');
      groupTitle.className = 'history-group-title';
      groupTitle.textContent = title;
      groupSection.appendChild(groupTitle);

      list.forEach((conv) => {
        const item = document.createElement('div');
        item.className = `history-item ${conv.id === state.activeConversationId ? 'active' : ''}`;
        item.dataset.id = conv.id;

        item.innerHTML = `
          <span class="history-item-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </span>
          <span class="history-item-title">${escapeHtml(conv.title || 'New Chat')}</span>
          <button class="history-delete-btn" title="Delete chat" aria-label="Delete chat">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        `;

        // Click on conversation to select
        item.addEventListener('click', (e) => {
          if (e.target.closest('.history-delete-btn')) return;
          selectConversation(conv.id);
          closeMobileSidebar();
        });

        // Click delete button
        const delBtn = item.querySelector('.history-delete-btn');
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          promptDeleteConversation(conv);
        });

        groupSection.appendChild(item);
      });

      DOM.historyGroups.appendChild(groupSection);
    }
  }

  async function selectConversation(conversationId) {
    if (state.isGenerating) {
      showToast('Please wait for current response to finish or stop generation.', 'warning');
      return;
    }

    state.activeConversationId = conversationId;

    // Highlight active in sidebar
    document.querySelectorAll('.history-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.id === conversationId);
    });

    try {
      const res = await fetch(`/api/conversations/${conversationId}`);
      if (!res.ok) throw new Error('Failed to load conversation details.');
      const data = await res.json();

      DOM.currentChatTitle.textContent = data.title || 'New Chat';
      renderMessageHistory(data.messages || []);
    } catch (err) {
      console.error('Failed to select conversation:', err);
      showToast('Could not load messages for selected chat.', 'error');
    }
  }

  function startNewChatSession() {
    if (state.isGenerating) {
      showToast('Please stop or wait for active generation before starting a new chat.', 'warning');
      return;
    }

    state.activeConversationId = null;
    DOM.currentChatTitle.textContent = 'New Chat';
    DOM.messagesList.innerHTML = '';
    DOM.emptyState.style.display = 'flex';

    // Deselect all sidebar items
    document.querySelectorAll('.history-item').forEach((el) => el.classList.remove('active'));

    closeMobileSidebar();
    DOM.messageInput.focus();
  }

  function promptDeleteConversation(conv) {
    state.conversationToDelete = conv;
    DOM.deleteTargetTitle.textContent = `"${conv.title || 'New Chat'}"`;
    openModal(DOM.deleteModal);
  }

  async function executeDeleteConversation() {
    if (!state.conversationToDelete) return;
    const convId = state.conversationToDelete.id;

    try {
      const res = await fetch(`/api/conversations/${convId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed.');

      closeModal(DOM.deleteModal);
      showToast('Conversation deleted.', 'success');

      // If active conversation was deleted, start new chat
      if (state.activeConversationId === convId) {
        state.activeConversationId = null;
        startNewChatSession();
      }

      await loadConversations();
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Failed to delete conversation.', 'error');
    } finally {
      state.conversationToDelete = null;
    }
  }

  function promptClearConversation() {
    if (!state.activeConversationId) {
      showToast('No active conversation to clear.', 'warning');
      return;
    }
    openModal(DOM.clearModal);
  }

  async function executeClearConversation() {
    if (!state.activeConversationId) return;

    try {
      const res = await fetch(`/api/conversations/${state.activeConversationId}/clear`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Clear failed.');

      closeModal(DOM.clearModal);
      DOM.messagesList.innerHTML = '';
      DOM.emptyState.style.display = 'flex';
      DOM.currentChatTitle.textContent = 'New Chat';
      showToast('Chat history cleared.', 'success');

      await loadConversations();
    } catch (err) {
      console.error('Clear error:', err);
      showToast('Failed to clear conversation.', 'error');
    }
  }

  // ============================================================================
  // Message Rendering
  // ============================================================================
  function renderMessageHistory(messages) {
    DOM.messagesList.innerHTML = '';

    if (!messages || messages.length === 0) {
      DOM.emptyState.style.display = 'flex';
      return;
    }

    DOM.emptyState.style.display = 'none';

    messages.forEach((msg) => {
      appendMessageCard(msg.role, msg.content, msg.created_at);
    });

    scrollToBottom(false);
  }

  function formatTime(isoString) {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function appendMessageCard(role, content, timestampIso = null) {
    DOM.emptyState.style.display = 'none';

    const row = document.createElement('div');
    row.className = `message-row ${role}`;

    const isUser = role === 'user';
    const avatarHtml = isUser
      ? `<div class="message-avatar" title="You">U</div>`
      : `<div class="message-avatar" title="AI Assistant">
           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
             <path d="M12 2a8 8 0 0 0-8 8c0 3.3 2 6.1 4.9 7.3L8 22l4.8-2.4c.4 0 .8.1 1.2.1a8 8 0 0 0 8-8 8 8 0 0 0-8-8z"/>
           </svg>
         </div>`;

    const senderName = isUser ? 'You' : 'AI Assistant';
    const timeDisplay = timestampIso ? `<span class="message-timestamp">${formatTime(timestampIso)}</span>` : '';

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'message-body';

    const senderHeader = document.createElement('div');
    senderHeader.className = 'message-sender';
    senderHeader.innerHTML = `<span>${senderName}</span>${timeDisplay}`;
    bodyDiv.appendChild(senderHeader);

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    if (isUser) {
      bubble.textContent = content;
    } else {
      bubble.innerHTML = `<div class="markdown-body">${renderMarkdown(content)}</div>`;
      enhanceCodeBlocks(bubble);
    }

    bodyDiv.appendChild(bubble);

    row.appendChild(avatarHtmlToElement(avatarHtml));
    row.appendChild(bodyDiv);

    DOM.messagesList.appendChild(row);
    return { row, bubble, senderHeader };
  }

  function attachLatencyBadge(senderHeader, metrics) {
    if (!senderHeader || !metrics) return;
    const existing = senderHeader.querySelector('.latency-badge');
    if (existing) existing.remove();

    const badge = document.createElement('span');
    if (metrics.cached) {
      badge.className = 'latency-badge';
      if (metrics.ttft_ms < 0) {
        badge.innerHTML = `⚡ ${metrics.ttft_ms}ms (Chrono-Buffer 🚀)`;
        badge.title = 'Quantum time-inversion simulation (-3ms response!)';
      } else {
        badge.innerHTML = `⚡ ${metrics.ttft_ms}ms (Instant Cache)`;
        badge.title = 'Served instantaneously from memory cache (< 1ms)';
      }
    } else {
      badge.className = 'latency-badge cloud';
      badge.innerHTML = `⚡ ${metrics.ttft_ms}ms (TTFT)`;
      badge.title = `Time to first token via ${metrics.model || 'Gemini 3.5 Flash Lite'}`;
    }
    senderHeader.appendChild(badge);
  }

  function avatarHtmlToElement(htmlString) {
    const template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content.firstChild;
  }

  // ============================================================================
  // Chat Execution & Streaming (Server-Sent Events)
  // ============================================================================
  async function sendMessage(overrideText = null) {
    const text = overrideText !== null ? overrideText.trim() : DOM.messageInput.value.trim();
    if (!text || state.isGenerating) return;

    // Clear input & reset textarea height
    DOM.messageInput.value = '';
    adjustTextareaHeight(DOM.messageInput);

    // 1. Append user message card to UI
    appendMessageCard('user', text, new Date().toISOString());
    scrollToBottom(true);

    // 2. Prepare assistant placeholder with animated thinking indicator
    const { row: asstRow, bubble: asstBubble, senderHeader: asstSenderHeader } = appendMessageCard('assistant', '');
    const markdownWrapper = asstBubble.querySelector('.markdown-body');
    markdownWrapper.innerHTML = `
      <div class="typing-indicator" title="AI is thinking...">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    `;

    // 3. Set generating state & send button icon to Stop
    setGeneratingState(true);

    let accumulatedText = '';
    let receivedFirstChunk = false;
    state.abortController = new AbortController();

    try {
      const payload = {
        conversation_id: state.activeConversationId,
        message: text,
        model: state.settings.model,
        system_prompt: state.settings.systemPrompt,
        temperature: state.settings.temperature,
        max_tokens: state.settings.maxTokens,
        stream: true,
      };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: state.abortController.signal,
      });

      if (!response.ok) {
        let errMessage = 'Failed to communicate with chat server.';
        try {
          const errData = await response.json();
          errMessage = errData.detail || errData.error || errMessage;
        } catch (_) {}
        throw new Error(errMessage);
      }

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep unfinished line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const jsonString = trimmed.replace(/^data:\s*/, '');
          if (!jsonString) continue;

          try {
            const event = JSON.parse(jsonString);

            if (event.type === 'start') {
              if (event.conversation_id && !state.activeConversationId) {
                state.activeConversationId = event.conversation_id;
              }
              if (event.title) {
                DOM.currentChatTitle.textContent = event.title;
              }
            } else if (event.type === 'metrics') {
              attachLatencyBadge(asstSenderHeader, event);
            } else if (event.type === 'chunk') {
              if (!receivedFirstChunk) {
                receivedFirstChunk = true;
                markdownWrapper.innerHTML = '';
              }
              accumulatedText += event.delta;
              markdownWrapper.innerHTML = renderMarkdown(accumulatedText) + '<span class="streaming-cursor"></span>';
              enhanceCodeBlocks(markdownWrapper);
              smartScrollToBottom();
            } else if (event.type === 'end') {
              if (event.title) {
                DOM.currentChatTitle.textContent = event.title;
              }
            } else if (event.type === 'error') {
              showToast('API Key or Service Error', 'error');
              markdownWrapper.innerHTML = `<div class="error-notice-card" style="border: 1px solid rgba(239, 68, 68, 0.35); background: rgba(239, 68, 68, 0.08); border-radius: 10px; padding: 14px 18px; margin: 8px 0; color: #fca5a5; line-height: 1.6;">${renderMarkdown(event.error)}</div>`;
              checkHealthAndModels();
              return;
            }
          } catch (jsonErr) {
            console.warn('Failed to parse SSE event JSON:', jsonString, jsonErr);
          }
        }
      }

      // Finish streaming render: remove blinking cursor
      markdownWrapper.innerHTML = renderMarkdown(accumulatedText);
      enhanceCodeBlocks(markdownWrapper);
      scrollToBottom(true);

      // Recheck health and reload conversations
      checkHealthAndModels();
      await loadConversations();
    } catch (err) {
      if (err.name === 'AbortError') {
        // User aborted intentionally
        if (!accumulatedText) {
          markdownWrapper.innerHTML = '<em>Generation cancelled by user.</em>';
        } else {
          markdownWrapper.innerHTML = renderMarkdown(accumulatedText) + ' <em>(stopped)</em>';
          enhanceCodeBlocks(markdownWrapper);
        }
        showToast('Generation stopped.', 'warning');
      } else {
        console.error('Chat streaming failed:', err);
        markdownWrapper.innerHTML = `<div style="color: var(--danger-color); padding: 8px 0;"><strong>Unable to complete request:</strong> ${escapeHtml(err.message)}</div>`;
        showToast(err.message || 'Error communicating with AI service.', 'error');
      }
    } finally {
      setGeneratingState(false);
      state.abortController = null;
    }
  }

  function setGeneratingState(isGenerating) {
    state.isGenerating = isGenerating;
    if (isGenerating) {
      DOM.sendBtn.classList.add('is-streaming');
      DOM.sendBtn.setAttribute('title', 'Stop generating');
    } else {
      DOM.sendBtn.classList.remove('is-streaming');
      DOM.sendBtn.setAttribute('title', 'Send message (Enter)');
      DOM.sendBtn.disabled = DOM.messageInput.value.trim().length === 0;
    }
  }

  function stopGeneration() {
    if (state.isGenerating && state.abortController) {
      state.abortController.abort();
    }
  }

  // ============================================================================
  // Scroll Management
  // ============================================================================
  function scrollToBottom(force = false) {
    const el = DOM.messagesContainer;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: force ? 'smooth' : 'auto',
    });
  }

  function smartScrollToBottom() {
    const el = DOM.messagesContainer;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // If user is within 150px of bottom, stick to bottom
    if (distanceToBottom < 150) {
      el.scrollTop = el.scrollHeight;
    }
  }

  function checkScrollPosition() {
    const el = DOM.messagesContainer;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceToBottom > 200) {
      DOM.scrollBottomBtn.style.display = 'flex';
    } else {
      DOM.scrollBottomBtn.style.display = 'none';
    }
  }

  // ============================================================================
  // Textarea Auto-Resize
  // ============================================================================
  function adjustTextareaHeight(textarea) {
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 200);
    textarea.style.height = `${newHeight}px`;

    // Toggle send button disabled status
    if (!state.isGenerating) {
      DOM.sendBtn.disabled = textarea.value.trim().length === 0;
    }
  }

  // ============================================================================
  // Modal Helpers
  // ============================================================================
  function openModal(modalEl) {
    modalEl.classList.add('open');
    modalEl.setAttribute('aria-hidden', 'false');
  }

  function closeModal(modalEl) {
    modalEl.classList.remove('open');
    modalEl.setAttribute('aria-hidden', 'true');
  }

  function openSettingsModal() {
    DOM.modelSelect.value = state.settings.model;
    DOM.systemPromptInput.value = state.settings.systemPrompt;
    DOM.temperatureSlider.value = state.settings.temperature;
    DOM.temperatureValue.textContent = Number(state.settings.temperature).toFixed(1);
    DOM.maxTokensSlider.value = state.settings.maxTokens;
    DOM.maxTokensValue.textContent = state.settings.maxTokens;
    openModal(DOM.settingsModal);
  }

  function saveSettings() {
    state.settings.model = DOM.modelSelect.value;
    state.settings.systemPrompt = DOM.systemPromptInput.value;
    state.settings.temperature = parseFloat(DOM.temperatureSlider.value);
    state.settings.maxTokens = parseInt(DOM.maxTokensSlider.value, 10);

    saveSettingsToStorage();
    updateModelDisplay();
    closeModal(DOM.settingsModal);
    showToast('Settings saved successfully.', 'success');
  }

  // ============================================================================
  // Mobile Sidebar Drawer
  // ============================================================================
  function openMobileSidebar() {
    DOM.sidebar.classList.add('open');
    DOM.sidebarBackdrop.classList.add('open');
  }

  function closeMobileSidebar() {
    DOM.sidebar.classList.remove('open');
    DOM.sidebarBackdrop.classList.remove('open');
  }

  // ============================================================================
  // Toast Notifications
  // ============================================================================
  function showToast(message, type = 'info', duration = 3500) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✓';
    if (type === 'error') icon = '✕';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span style="font-weight: 600;">${icon}</span><span>${escapeHtml(message)}</span>`;
    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 200ms ease';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  // ============================================================================
  // Event Listeners Binding
  // ============================================================================
  function bindEventListeners() {
    // Input typing & keyboard triggers
    DOM.messageInput.addEventListener('input', () => adjustTextareaHeight(DOM.messageInput));

    DOM.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (state.isGenerating) {
          stopGeneration();
        } else {
          sendMessage();
        }
      }
    });

    // Send / Stop button click
    DOM.sendBtn.addEventListener('click', () => {
      if (state.isGenerating) {
        stopGeneration();
      } else {
        sendMessage();
      }
    });

    // Suggested prompt cards click
    document.querySelectorAll('.suggestion-card').forEach((card) => {
      card.addEventListener('click', () => {
        const promptText = card.dataset.prompt;
        if (promptText) {
          sendMessage(promptText);
        }
      });
    });

    // New Chat buttons
    DOM.newChatBtn.addEventListener('click', startNewChatSession);

    // Clear Chat button
    DOM.clearChatBtn.addEventListener('click', promptClearConversation);
    DOM.confirmClearBtn.addEventListener('click', executeClearConversation);
    DOM.cancelClearBtn.addEventListener('click', () => closeModal(DOM.clearModal));
    DOM.closeClearModalBtn.addEventListener('click', () => closeModal(DOM.clearModal));

    // Delete Modal controls
    DOM.confirmDeleteBtn.addEventListener('click', executeDeleteConversation);
    DOM.cancelDeleteBtn.addEventListener('click', () => closeModal(DOM.deleteModal));
    DOM.closeDeleteModalBtn.addEventListener('click', () => closeModal(DOM.deleteModal));

    // Settings Modal controls
    DOM.openSettingsBtn.addEventListener('click', openSettingsModal);
    DOM.headerSettingsBtn.addEventListener('click', openSettingsModal);
    DOM.closeSettingsBtn.addEventListener('click', () => closeModal(DOM.settingsModal));
    DOM.cancelSettingsBtn.addEventListener('click', () => closeModal(DOM.settingsModal));
    DOM.saveSettingsBtn.addEventListener('click', saveSettings);

    DOM.temperatureSlider.addEventListener('input', () => {
      DOM.temperatureValue.textContent = Number(DOM.temperatureSlider.value).toFixed(1);
    });

    DOM.maxTokensSlider.addEventListener('input', () => {
      DOM.maxTokensValue.textContent = DOM.maxTokensSlider.value;
    });

    DOM.resetPromptBtn.addEventListener('click', () => {
      if (state.modelsConfig && state.modelsConfig.default_system_prompt) {
        DOM.systemPromptInput.value = state.modelsConfig.default_system_prompt;
      }
    });

    // Mobile Sidebar controls
    DOM.openSidebarBtn.addEventListener('click', openMobileSidebar);
    DOM.closeSidebarBtn.addEventListener('click', closeMobileSidebar);
    DOM.sidebarBackdrop.addEventListener('click', closeMobileSidebar);

    // Dismiss Notice Banner
    DOM.dismissBannerBtn.addEventListener('click', () => {
      DOM.apiNoticeBanner.style.display = 'none';
    });

    // Scroll-to-bottom
    DOM.messagesContainer.addEventListener('scroll', checkScrollPosition);
    DOM.scrollBottomBtn.addEventListener('click', () => scrollToBottom(true));

    // Global keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      // Ctrl+K -> New chat
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        startNewChatSession();
      }
      // Escape -> close any open modal or sidebar
      if (e.key === 'Escape') {
        closeModal(DOM.settingsModal);
        closeModal(DOM.deleteModal);
        closeModal(DOM.clearModal);
        closeMobileSidebar();
      }
    });
  }

  // Run on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
