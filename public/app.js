/**
 * 爱背诵 - 前端应用
 * 与后端API对接版本
 */

// ==================== 配置 ====================
const API_BASE = window.location.origin + '/api/v1';
const WS_BASE = window.location.origin.replace('http', 'ws') + '/ws';

// ==================== 全局状态 ====================
const AppState = {
    user: null,
    token: null,
    currentPage: 'home',
    content: {
        id: null,
        title: '',
        text: '',
        sentences: []
    },
    session: {
        id: null,
        type: 'new_learning'
    },
    settings: {
        speechRate: 0.9,
        speechVolume: 1,
        autoNext: true
    },
    recitation: {
        mode: 'repeat',
        currentIndex: 0,
        results: [],
        isListening: false,
        isSpeaking: false
    },
    history: {
        records: [],
        stats: {
            totalCount: 0,
            avgScore: 0,
            streakDays: 0,
            todayCount: 0
        }
    }
};

// ==================== API 请求封装 ====================
async function apiRequest(endpoint, options = {}) {
    const url = API_BASE + endpoint;
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (AppState.token) {
        headers['Authorization'] = `Bearer ${AppState.token}`;
    }
    
    try {
        const response = await fetch(url, {
            ...options,
            headers
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || '请求失败');
        }
        
        return data;
    } catch (err) {
        console.error('API请求错误:', err);
        throw err;
    }
}

// ==================== 认证服务 ====================
const AuthService = {
    async guestLogin() {
        const res = await apiRequest('/auth/guest', { method: 'POST' });
        AppState.user = res.data.user;
        AppState.token = res.data.token;
        this.saveAuth();
        return res.data;
    },
    
    async login(phone, password) {
        const res = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ phone, password })
        });
        AppState.user = res.data.user;
        AppState.token = res.data.token;
        this.saveAuth();
        return res.data;
    },
    
    async register(phone, password, nickname) {
        const res = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ phone, password, nickname })
        });
        AppState.user = res.data.user;
        AppState.token = res.data.token;
        this.saveAuth();
        return res.data;
    },
    
    saveAuth() {
        localStorage.setItem('ai_recite_auth', JSON.stringify({
            user: AppState.user,
            token: AppState.token
        }));
    },
    
    loadAuth() {
        const saved = localStorage.getItem('ai_recite_auth');
        if (saved) {
            const { user, token } = JSON.parse(saved);
            AppState.user = user;
            AppState.token = token;
            return true;
        }
        return false;
    },
    
    logout() {
        AppState.user = null;
        AppState.token = null;
        localStorage.removeItem('ai_recite_auth');
    }
};

// ==================== 内容服务 ====================
const ContentService = {
    async getList(params = {}) {
        const query = new URLSearchParams(params).toString();
        return apiRequest(`/contents?${query}`);
    },
    
    async getById(id) {
        return apiRequest(`/contents/${id}`);
    },
    
    async getRecommended() {
        return apiRequest('/contents/recommended/list');
    },
    
    async search(q) {
        return apiRequest(`/contents/search/query?q=${encodeURIComponent(q)}`);
    },
    
    async create(data) {
        return apiRequest('/contents', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
};

// ==================== 会话服务 ====================
const SessionService = {
    async create(contentId, type = 'new_learning') {
        return apiRequest('/sessions', {
            method: 'POST',
            body: JSON.stringify({ content_id: contentId, session_type: type })
        });
    },
    
    async get(sessionId) {
        return apiRequest(`/sessions/${sessionId}`);
    },
    
    async recite(sessionId, data) {
        return apiRequest(`/sessions/${sessionId}/recite`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },
    
    async end(sessionId) {
        return apiRequest(`/sessions/${sessionId}/end`, {
            method: 'PUT'
        });
    }
};

// ==================== 教师服务 ====================
const TeacherService = {
    async chat(message, context = []) {
        return apiRequest('/teacher/chat', {
            method: 'POST',
            body: JSON.stringify({ message, context })
        });
    },
    
    async explain(contentId, part = null) {
        return apiRequest('/teacher/explain', {
            method: 'POST',
            body: JSON.stringify({ content_id: contentId, part })
        });
    },
    
    async getHint(standardText, userInput, level = 1) {
        return apiRequest('/teacher/hint', {
            method: 'POST',
            body: JSON.stringify({ 
                standard_text: standardText, 
                user_input: userInput, 
                hint_level: level 
            })
        });
    }
};

// ==================== 复习服务 ====================
const ReviewService = {
    async getToday() {
        return apiRequest('/reviews/today');
    },
    
    async getSchedule(days = 7) {
        return apiRequest(`/reviews/schedule?days=${days}`);
    },
    
    async complete(masteryId, score) {
        return apiRequest(`/reviews/${masteryId}/complete`, {
            method: 'POST',
            body: JSON.stringify({ score })
        });
    },
    
    async getMistakes() {
        return apiRequest('/reviews/mistakes');
    }
};

// ==================== 用户服务 ====================
const UserService = {
    async getProfile() {
        return apiRequest('/users/profile');
    },
    
    async updateProfile(data) {
        return apiRequest('/users/profile', {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },
    
    async getStats() {
        return apiRequest('/users/stats');
    },
    
    async getHistory(limit = 20) {
        return apiRequest(`/users/history?limit=${limit}`);
    }
};

// ==================== 语音合成 ====================
class SpeechSynthesizer {
    constructor() {
        this.synth = window.speechSynthesis;
        this.voice = null;
        this.voices = [];
        this.init();
    }
    
    init() {
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = () => {
                this.voices = this.synth.getVoices();
                this.setVoice();
            };
        }
        // 尝试立即获取
        this.voices = this.synth.getVoices();
        this.setVoice();
    }
    
    setVoice(isEnglish = false) {
        if (this.voices.length === 0) {
            this.voice = null;
            return;
        }
        
        if (isEnglish) {
            // 英文内容使用英文语音
            this.voice = this.voices.find(v => v.lang.includes('en') && v.name.includes('Female')) ||
                        this.voices.find(v => v.lang.includes('en')) ||
                        this.voices[0];
        } else {
            // 中文内容使用中文语音
            this.voice = this.voices.find(v => v.lang.includes('zh') && v.name.includes('Female')) ||
                         this.voices.find(v => v.lang.includes('zh')) ||
                         this.voices[0];
        }
    }
    
    speak(text, onEnd = null, isEnglish = false) {
        if (!this.synth) {
            console.warn('语音合成不可用');
            if (onEnd) onEnd();
            return;
        }
        
        // 停止之前的语音
        this.synth.cancel();
        
        // 根据语言设置选择语音
        if (isEnglish) {
            this.setVoice(true);
        } else {
            this.setVoice(false);
        }
        
        const utterance = new SpeechSynthesisUtterance(text);
        
        if (this.voice) {
            utterance.voice = this.voice;
        }
        
        utterance.rate = AppState.settings.speechRate;
        utterance.volume = AppState.settings.speechVolume;
        utterance.pitch = 1.1;
        
        AppState.recitation.isSpeaking = true;
        updateVoiceIndicator('speaking', text);
        
        utterance.onend = () => {
            AppState.recitation.isSpeaking = false;
            updateVoiceIndicator('idle');
            if (onEnd) onEnd();
        };
        
        utterance.onerror = (e) => {
            console.warn('语音合成错误 (已忽略):', e.error);
            AppState.recitation.isSpeaking = false;
            updateVoiceIndicator('idle');
            if (onEnd) onEnd();
        };
        
        // 延迟一小段时间确保.cancel()生效
        setTimeout(() => {
            try {
                this.synth.speak(utterance);
            } catch (e) {
                console.warn('语音合成启动失败:', e);
                AppState.recitation.isSpeaking = false;
                updateVoiceIndicator('idle');
                if (onEnd) onEnd();
            }
        }, 50);
    }
    
    stop() {
        if (this.synth) {
            this.synth.cancel();
            AppState.recitation.isSpeaking = false;
        }
    }
}

const speechSynthesizer = new SpeechSynthesizer();

// ==================== 语音识别 ====================
class SpeechRecognizer {
    constructor() {
        this.recognition = null;
        this.isEnglish = false;
        this.init();
    }
    
    init() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('浏览器不支持语音识别');
            return;
        }
        
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;
    }
    
    setLanguage(isEnglish = false) {
        this.isEnglish = isEnglish;
        if (this.recognition) {
            this.recognition.lang = isEnglish ? 'en-US' : 'zh-CN';
        }
    }
    
    start(onResult, onEnd, onError) {
        // 如果已经在运行，先停止
        if (this.recognition && AppState.recitation.isListening) {
            try {
                this.recognition.stop();
            } catch (e) {
                // 忽略已停止的错误
            }
        }
        
        if (!this.recognition) {
            simulateSpeechRecognition(onResult, onEnd);
            return;
        }
        
        // 设置语言
        this.setLanguage(AppState.content.type?.startsWith('english'));
        
        let finalTranscript = '';
        const self = this;
        
        // 清理之前的事件处理器
        this.recognition.onresult = null;
        this.recognition.onend = null;
        this.recognition.onerror = null;
        
        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }
            if (onResult) onResult(finalTranscript || interimTranscript, !!finalTranscript);
        };
        
        this.recognition.onend = () => {
            recognitionActive = false;
            AppState.recitation.isListening = false;
            updateMicButton(false);
            if (onEnd) onEnd(finalTranscript);
        };
        
        this.recognition.onerror = (e) => {
            // 忽略常见的非严重错误
            if (e.error === 'no-speech' || e.error === 'aborted') {
                console.log('语音识别被中止或无语音输入');
            } else if (e.error === 'not-allowed') {
                console.warn('语音识别被浏览器阻止，请允许麦克风权限');
            } else {
                console.warn('语音识别错误 (已忽略):', e.error);
            }
            recognitionActive = false;
            AppState.recitation.isListening = false;
            updateMicButton(false);
            if (onEnd) onEnd(finalTranscript);
        };
        
        AppState.recitation.isListening = true;
        updateMicButton(true);
        
        try {
            this.recognition.start();
        } catch (e) {
            console.error('启动识别失败:', e);
            AppState.recitation.isListening = false;
            updateMicButton(false);
        }
    }
    
    stop() {
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (e) {
                // 忽略已停止的错误
            }
        }
        recognitionActive = false;
        AppState.recitation.isListening = false;
        updateMicButton(false);
    }
}

const speechRecognizer = new SpeechRecognizer();

function simulateSpeechRecognition(onResult, onEnd) {
    AppState.recitation.isListening = true;
    updateMicButton(true);
    
    setTimeout(() => {
        const currentSentence = AppState.content.sentences[AppState.recitation.currentIndex];
        const isCorrect = Math.random() > 0.3;
        const result = isCorrect ? currentSentence : currentSentence.slice(0, -2);
        
        if (onResult) onResult(result, true);
        
        setTimeout(() => {
            AppState.recitation.isListening = false;
            updateMicButton(false);
            if (onEnd) onEnd(result);
        }, 500);
    }, 2000);
}

// ==================== 页面导航 ====================
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    const targetPage = document.getElementById(pageId + '-page');
    if (targetPage) {
        targetPage.classList.add('active');
        AppState.currentPage = pageId;
    }
}

function goHome() {
    speechSynthesizer.stop();
    speechRecognizer.stop();
    showPage('home');
    loadHomeData();
}

function goBack() {
    if (AppState.currentPage === 'preview') {
        showPage('text');
    } else if (AppState.currentPage === 'recitation') {
        confirmExit();
    } else {
        goHome();
    }
}

// ==================== 首页功能 ====================
async function loadHomeData() {
    try {
        const statsRes = await UserService.getStats();
        AppState.history.stats = statsRes.data;
        document.getElementById('today-count').textContent = statsRes.data.todaySessions || 0;
    } catch (err) {
        console.error('加载首页数据失败:', err);
    }
}

function showTextInput() {
    showPage('text-input');
}

function showImageInput() {
    showPage('image-input');
    initImageUpload();
}

async function showHistory() {
    showPage('history');
    await renderHistory();
}

async function showContentLibrary() {
    showPage('library');
    await loadContentLibrary();
}

// ==================== 内容库功能 ====================
// 当前筛选状态
let currentContentType = 'all';

// ==================== 内容库功能 ====================
async function loadContentLibrary(type = 'all') {
    try {
        const params = { limit: 50 };
        if (type !== 'all') {
            params.type = type === 'chinese' ? 'chinese_poem' : 'english_poem';
        }
        const res = await ContentService.getList(params);
        const container = document.getElementById('content-list');
        
        if (container && res.data) {
            container.innerHTML = res.data.map(item => {
                const typeIcon = item.type.startsWith('english') ? '🇬🇧' : '📜';
                const typeLabel = item.type.startsWith('english') ? '英文' : '中文';
                return `
                <div class="content-item" onclick="selectContent('${item.id}')">
                    <div class="content-header">
                        <div class="content-title">${typeIcon} ${item.title}</div>
                        <span class="content-type-badge">${typeLabel}</span>
                    </div>
                    <div class="content-meta">${item.author || ''} ${item.dynasty || ''}</div>
                    <div class="content-preview">${item.original_text.slice(0, 50)}${item.original_text.length > 50 ? '...' : ''}</div>
                </div>
            `}).join('');
        }
    } catch (err) {
        console.error('加载内容库失败:', err);
    }
}

function filterByType(type) {
    currentContentType = type;
    
    // 更新Tab样式
    document.querySelectorAll('.type-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.type === type) {
            tab.classList.add('active');
        }
    });
    
    // 重新加载内容
    loadContentLibrary(type);
}

async function selectContent(contentId) {
    try {
        const res = await ContentService.getById(contentId);
        const content = res.data;
        
        AppState.content.id = content.id;
        AppState.content.title = content.title;
        AppState.content.text = content.original_text;
        AppState.content.sentences = splitIntoSentences(content.original_text);
        AppState.content.type = content.type;
        
        renderContentPreview();
        showPage('preview');
    } catch (err) {
        console.error('获取内容失败:', err);
        alert('获取内容失败');
    }
}

// ==================== 文字输入功能 ====================
async function previewContent() {
    const text = document.getElementById('content-text').value.trim();
    if (!text) {
        alert('请输入要背诵的内容');
        return;
    }
    
    AppState.content.title = text.slice(0, 10) + (text.length > 10 ? '...' : '');
    AppState.content.text = text;
    AppState.content.sentences = splitIntoSentences(text);
    
    // 创建自定义内容
    try {
        const res = await ContentService.create({
            title: AppState.content.title,
            original_text: text,
            type: 'custom'
        });
        AppState.content.id = res.data.id;
    } catch (err) {
        console.error('创建内容失败:', err);
    }
    
    renderContentPreview();
    showPage('preview');
}

function splitIntoSentences(text) {
    const sentences = text
        .replace(/([。！？；.!?;])/g, '$1\n')
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);
    
    return sentences.length > 0 ? sentences : [text];
}

function renderContentPreview() {
    document.getElementById('preview-title').textContent = AppState.content.title;
    const previewContainer = document.getElementById('content-preview');
    previewContainer.innerHTML = '';
    
    AppState.content.sentences.forEach((sentence, index) => {
        const div = document.createElement('div');
        div.className = 'sentence';
        div.textContent = `${index + 1}. ${sentence}`;
        previewContainer.appendChild(div);
    });
}

// ==================== 模式选择 ====================
function selectMode(mode) {
    AppState.recitation.mode = mode;
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    document.querySelector(`[data-mode="${mode}"]`).classList.add('selected');
}

// ==================== 背诵功能 ====================
async function startRecitation() {
    AppState.recitation.currentIndex = 0;
    AppState.recitation.results = [];
    
    // 创建学习会话
    try {
        const res = await SessionService.create(AppState.content.id, AppState.session.type);
        AppState.session.id = res.data.session_id;
    } catch (err) {
        console.error('创建会话失败:', err);
    }
    
    document.getElementById('recitation-title').textContent = AppState.content.title;
    renderRecitationContent();
    updateProgress();
    
    showPage('recitation');
    
    const isEnglish = AppState.content.type?.startsWith('english');
    
    // 开场语音
    setTimeout(() => {
        let openingText;
        if (isEnglish) {
            openingText = `Hello! Today we're going to recite "${AppState.content.title}". Are you ready? Let's begin!`;
        } else {
            openingText = `同学们好！今天我们来背诵《${AppState.content.title}》。准备好了吗？让我们开始吧！`;
        }
        speechSynthesizer.speak(openingText, () => {
            startCurrentSentence();
        }, isEnglish);
    }, 500);
}

function renderRecitationContent() {
    const container = document.getElementById('content-display');
    container.innerHTML = '';
    
    AppState.content.sentences.forEach((sentence, index) => {
        const div = document.createElement('div');
        div.className = 'sentence-item';
        div.id = `sentence-${index}`;
        
        if (AppState.recitation.mode === 'fill' && index === AppState.recitation.currentIndex) {
            const halfLength = Math.ceil(sentence.length / 2);
            div.innerHTML = `${sentence.slice(0, halfLength)}<span class="fill-blank">?</span>`;
        } else if (AppState.recitation.mode === 'hint' && index === AppState.recitation.currentIndex) {
            div.innerHTML = `<span class="hint-text">${sentence[0]}</span>${'▪'.repeat(sentence.length - 1)}`;
        } else if (index < AppState.recitation.currentIndex) {
            div.textContent = sentence;
        } else {
            div.textContent = sentence;
        }
        
        container.appendChild(div);
    });
    
    highlightCurrentSentence();
}

function highlightCurrentSentence() {
    document.querySelectorAll('.sentence-item').forEach((el, index) => {
        el.classList.remove('current', 'completed', 'error');
        if (index === AppState.recitation.currentIndex) {
            el.classList.add('current');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (index < AppState.recitation.currentIndex) {
            const result = AppState.recitation.results[index];
            el.classList.add(result && result.isCorrect ? 'completed' : 'error');
        }
    });
}

function updateProgress() {
    const progress = (AppState.recitation.currentIndex / AppState.content.sentences.length) * 100;
    document.getElementById('progress-fill').style.width = `${progress}%`;
}

function startCurrentSentence() {
    const currentSentence = AppState.content.sentences[AppState.recitation.currentIndex];
    const mode = AppState.recitation.mode;
    const isEnglish = AppState.content.type?.startsWith('english');
    
    renderRecitationContent();
    
    // 检查语音合成是否可用
    if (!window.speechSynthesis) {
        // 语音不可用，直接进入监听模式
        updateVoiceIndicator('listening');
        return;
    }
    
    if (mode === 'repeat') {
        if (isEnglish) {
            speechSynthesizer.speak(`Read after me: '${currentSentence}' —`, () => {
                updateVoiceIndicator('listening');
            }, true);
        } else {
            speechSynthesizer.speak(`跟我一起读：'${currentSentence}'——`, () => {
                updateVoiceIndicator('listening');
            }, false);
        }
    } else if (mode === 'fill') {
        const halfLength = Math.ceil(currentSentence.length / 2);
        const prefix = currentSentence.slice(0, halfLength);
        if (isEnglish) {
            speechSynthesizer.speak(`'${prefix}', what's next?`, () => {
                updateVoiceIndicator('listening');
            }, true);
        } else {
            speechSynthesizer.speak(`'${prefix}'，接下来是什么？`, () => {
                updateVoiceIndicator('listening');
            }, false);
        }
    } else if (mode === 'hint') {
        if (isEnglish) {
            speechSynthesizer.speak(`The first word is '${currentSentence.split(' ')[0]}'. What comes next?`, () => {
                updateVoiceIndicator('listening');
            }, true);
        } else {
            speechSynthesizer.speak(`第一个字是'${currentSentence[0]}'，想一想后面是什么？`, () => {
                updateVoiceIndicator('listening');
            }, false);
        }
    } else if (mode === 'full') {
        if (AppState.recitation.currentIndex === 0) {
            if (isEnglish) {
                speechSynthesizer.speak('Please start reciting', () => {
                    updateVoiceIndicator('listening');
                }, true);
            } else {
                speechSynthesizer.speak('请开始背诵', () => {
                    updateVoiceIndicator('listening');
                }, false);
            }
        } else {
            updateVoiceIndicator('listening');
        }
    }
}

function updateVoiceIndicator(state, text = '') {
    const indicator = document.getElementById('voice-indicator');
    const voiceText = document.getElementById('voice-text');
    const waves = indicator?.querySelector('.voice-waves');
    
    if (state === 'speaking') {
        if (voiceText) voiceText.textContent = `🎵 ${text.slice(0, 20)}...`;
        waves?.classList.remove('listening');
    } else if (state === 'listening') {
        if (voiceText) voiceText.textContent = '🎤 正在听...';
        waves?.classList.add('listening');
    } else {
        if (voiceText) voiceText.textContent = '点击开始';
        waves?.classList.remove('listening');
    }
}

function updateMicButton(isListening) {
    const micBtn = document.getElementById('mic-btn');
    if (micBtn) {
        if (isListening) {
            micBtn.classList.add('listening');
        } else {
            micBtn.classList.remove('listening');
        }
    }
}

// ==================== 麦克风控制 ====================
let speechRecognitionBusy = false; // 防止重复启动
let isStopping = false; // 防止停止过程中误触发
let recognitionActive = false; // 追踪识别器真实状态

function startListening() {
    // 如果正在停止中，不响应
    if (isStopping) {
        return;
    }
    
    // 如果正在说话，先停止
    if (AppState.recitation.isSpeaking) {
        speechSynthesizer.stop();
    }
    
    // 如果识别器还在运行，先停止
    if (recognitionActive) {
        try {
            speechRecognizer.stop();
        } catch (e) {}
        // 等待识别器真正停止
        setTimeout(() => {
            recognitionActive = false;
            startListening(); // 递归调用重新开始
        }, 200);
        return;
    }
    
    // 如果已经在监听，先停止
    if (AppState.recitation.isListening) {
        speechRecognizer.stop();
        recognitionActive = false;
        return;
    }
    
    speechRecognitionBusy = true;
    isStopping = false;
    recognitionActive = true;
    
    speechRecognizer.start(
        (text, isFinal) => {
            speechRecognitionBusy = false;
            if (isFinal && text) {
                handleRecitationResult(text);
            }
        },
        (finalText) => {
            speechRecognitionBusy = false;
            recognitionActive = false;
            if (finalText) {
                handleRecitationResult(finalText);
            }
        }
    );
}

function stopListening() {
    // 如果正在停止中，不重复停止
    if (isStopping) {
        return;
    }
    
    if (recognitionActive || AppState.recitation.isListening) {
        isStopping = true;
        try {
            speechRecognizer.stop();
        } catch (e) {}
        speechRecognitionBusy = false;
        recognitionActive = false;
        AppState.recitation.isListening = false;
        updateMicButton(false);
        
        setTimeout(() => {
            isStopping = false;
        }, 300);
    }
}

// 停止所有语音活动（不退出背诵页面）
function stopAll() {
    console.log('停止所有语音活动');
    isStopping = true;
    
    // 停止语音合成
    speechSynthesizer.stop();
    
    // 停止语音识别
    try {
        speechRecognizer.stop();
    } catch (e) {}
    speechRecognitionBusy = false;
    recognitionActive = false;
    AppState.recitation.isListening = false;
    
    // 更新UI
    updateVoiceIndicator('idle');
    updateMicButton(false);
    
    setTimeout(() => {
        isStopping = false;
    }, 300);
    
    // 提示用户
    const isEnglish = AppState.content.type?.startsWith('english');
    if (isEnglish) {
        speechSynthesizer.speak('Stopped. Click the microphone when ready.', null, true);
    } else {
        speechSynthesizer.speak('已停止，准备好后点击麦克风继续。', null, false);
    }
}

async function handleRecitationResult(recitedText) {
    const currentIndex = AppState.recitation.currentIndex;
    const currentSentence = AppState.content.sentences[currentIndex];
    const isEnglish = AppState.content.type?.startsWith('english');
    
    // 调用后端评估
    let evaluation;
    try {
        const res = await SessionService.recite(AppState.session.id, {
            input_type: 'text',
            input_content: recitedText,
            standard_text: currentSentence
        });
        evaluation = {
            isCorrect: res.data.evaluation.is_correct,
            accuracy: res.data.evaluation.accuracy,
            errors: res.data.evaluation.errors
        };
    } catch (err) {
        console.error('评估失败:', err);
        // 本地评估兜底
        evaluation = evaluateRecitation(currentSentence, recitedText);
    }
    
    AppState.recitation.results[currentIndex] = evaluation;
    
    if (evaluation.isCorrect) {
        let encouragement;
        if (isEnglish) {
            const encouragements = ['Great!', 'Excellent!', 'Wonderful!', 'Perfect!'];
            encouragement = encouragements[Math.floor(Math.random() * encouragements.length)];
        } else {
            const encouragements = ['很好！', '不错！', '真棒！', '非常好！'];
            encouragement = encouragements[Math.floor(Math.random() * encouragements.length)];
        }
        speechSynthesizer.speak(encouragement, () => {
            nextSentence();
        }, isEnglish);
    } else {
        let feedback;
        if (isEnglish) {
            feedback = `Almost! It should be '${currentSentence}'. Let's try again~`;
        } else {
            feedback = `接近了，应该是'${currentSentence}'，我们再来一遍~`;
        }
        speechSynthesizer.speak(feedback, () => {
            setTimeout(() => startCurrentSentence(), 500);
        }, isEnglish);
    }
}

function evaluateRecitation(original, recited) {
    const cleanOriginal = preprocessText(original);
    const cleanRecited = preprocessText(recited);
    const similarity = calculateSimilarity(cleanOriginal, cleanRecited);
    const isCorrect = similarity >= 0.7;
    
    return {
        original,
        recited,
        similarity,
        isCorrect,
        accuracy: Math.round(similarity * 100)
    };
}

function preprocessText(text) {
    return text.replace(/[，。！？、；：""''（）【】\s]/g, '').toLowerCase();
}

function calculateSimilarity(str1, str2) {
    if (str1 === str2) return 1;
    if (!str1 || !str2) return 0;
    
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = [];
    
    for (let i = 0; i <= len1; i++) matrix[i] = [i];
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    
    return 1 - matrix[len1][len2] / Math.max(len1, len2);
}

function nextSentence() {
    AppState.recitation.currentIndex++;
    updateProgress();
    
    if (AppState.recitation.currentIndex >= AppState.content.sentences.length) {
        finishRecitation();
    } else {
        setTimeout(() => startCurrentSentence(), 500);
    }
}

async function finishRecitation() {
    const results = AppState.recitation.results;
    const correctCount = results.filter(r => r.isCorrect).length;
    const totalCount = results.length;
    
    // 结束会话
    let finalScore = 0;
    try {
        const res = await SessionService.end(AppState.session.id);
        finalScore = res.data.final_score;
    } catch (err) {
        console.error('结束会话失败:', err);
        const avgAccuracy = results.reduce((sum, r) => sum + r.accuracy, 0) / totalCount;
        const completeness = (correctCount / totalCount) * 100;
        finalScore = Math.round(avgAccuracy * 0.6 + completeness * 0.4);
    }
    
    showResult(finalScore, results);
}

// ==================== 控制按钮 ====================
function repeatCurrent() {
    speechSynthesizer.stop();
    speechRecognizer.stop();
    startCurrentSentence();
}

async function showHint() {
    const currentSentence = AppState.content.sentences[AppState.recitation.currentIndex];
    const isEnglish = AppState.content.type?.startsWith('english');
    
    try {
        const res = await TeacherService.getHint(currentSentence, '', 2);
        speechSynthesizer.speak(res.data.hint, null, isEnglish);
    } catch (err) {
        if (isEnglish) {
            speechSynthesizer.speak(`Hint: starts with "${currentSentence.split(' ')[0]}"...`, null, true);
        } else {
            speechSynthesizer.speak(`提示：${currentSentence.slice(0, 3)}...`, null, false);
        }
    }
}

function skipCurrent() {
    const currentSentence = AppState.content.sentences[AppState.recitation.currentIndex];
    AppState.recitation.results[AppState.recitation.currentIndex] = {
        original: currentSentence,
        recited: '',
        similarity: 0,
        isCorrect: false,
        accuracy: 0
    };
    nextSentence();
}

function confirmExit() {
    document.getElementById('exit-modal').classList.remove('hidden');
}

function closeExitModal() {
    document.getElementById('exit-modal').classList.add('hidden');
}

function confirmExitRecitation() {
    closeExitModal();
    speechSynthesizer.stop();
    speechRecognizer.stop();
    goHome();
}

// ==================== 设置 ====================
function toggleSettings() {
    const modal = document.getElementById('settings-modal');
    modal.classList.toggle('hidden');
}

function closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
}

document.getElementById('speech-rate')?.addEventListener('input', (e) => {
    AppState.settings.speechRate = parseFloat(e.target.value);
    document.getElementById('rate-value').textContent = e.target.value;
});

document.getElementById('speech-volume')?.addEventListener('input', (e) => {
    AppState.settings.speechVolume = parseFloat(e.target.value);
    document.getElementById('volume-value').textContent = Math.round(e.target.value * 100) + '%';
});

document.getElementById('auto-next')?.addEventListener('change', (e) => {
    AppState.settings.autoNext = e.target.checked;
});

// ==================== 结果展示 ====================
function showResult(score, results) {
    showPage('result');
    
    animateScore(score);
    
    const stars = calculateStars(score);
    document.getElementById('stars').textContent = stars;
    document.getElementById('result-comment').textContent = getComment(score);
    
    const correctCount = results.filter(r => r.isCorrect).length;
    const avgAccuracy = results.reduce((sum, r) => sum + r.accuracy, 0) / results.length;
    
    document.getElementById('accuracy-value').textContent = Math.round(avgAccuracy) + '%';
    document.getElementById('accuracy-bar').style.width = avgAccuracy + '%';
    
    const completeness = (correctCount / results.length) * 100;
    document.getElementById('completeness-value').textContent = Math.round(completeness) + '%';
    document.getElementById('completeness-bar').style.width = completeness + '%';
    
    const fluency = Math.min(100, score + Math.random() * 20 - 10);
    document.getElementById('fluency-value').textContent = Math.round(fluency) + '%';
    document.getElementById('fluency-bar').style.width = fluency + '%';
    
    renderErrorAnalysis(results);
    
    const closingText = getClosingText(score);
    const isEnglish = AppState.content.type?.startsWith('english');
    setTimeout(() => {
        speechSynthesizer.speak(closingText, null, isEnglish);
    }, 1000);
}

function animateScore(targetScore) {
    const scoreElement = document.getElementById('score-number');
    let currentScore = 0;
    const increment = targetScore / 30;
    const timer = setInterval(() => {
        currentScore += increment;
        if (currentScore >= targetScore) {
            currentScore = targetScore;
            clearInterval(timer);
        }
        scoreElement.textContent = Math.round(currentScore);
    }, 30);
}

function calculateStars(score) {
    if (score >= 90) return '🌟🌟🌟🌟🌟';
    if (score >= 75) return '🌟🌟🌟🌟';
    if (score >= 60) return '🌟🌟🌟';
    if (score >= 40) return '🌟🌟';
    return '🌟';
}

function getComment(score) {
    const isEnglish = AppState.content.type?.startsWith('english');
    if (score >= 90) {
        return isEnglish ? 'Perfect! You could be a teacher!' : '完美！你可以当小老师了！';
    }
    if (score >= 75) {
        return isEnglish ? 'Excellent! A few more practices and you\'ll be perfect!' : '非常棒！再练习几次就能满分了！';
    }
    if (score >= 60) {
        return isEnglish ? 'Good job! Keep it up!' : '不错！继续加油，下次会更好！';
    }
    if (score >= 40) {
        return isEnglish ? 'Good progress! Let\'s try again~' : '有进步！我们再来一遍~';
    }
    return isEnglish ? 'Don\'t worry, practice makes perfect!' : '没关系，多练习就能记住！';
}

function getClosingText(score) {
    const isEnglish = AppState.content.type?.startsWith('english');
    if (score >= 90) {
        return isEnglish ? 'Amazing! You\'ve mastered it! Give yourself a round of applause!' : '太棒了！你已经完全掌握了！给自己鼓鼓掌吧！';
    }
    if (score >= 75) {
        return isEnglish ? 'Great job! A few more practices will make you more proficient!' : '很不错！再练习几次会更熟练！';
    }
    if (score >= 60) {
        return isEnglish ? 'Making progress! Keep going!' : '有进步！继续加油！';
    }
    return isEnglish ? 'Don\'t worry, practice makes perfect! You\'ll do better next time!' : '没关系，多练习就能记住！下次一定能更好！';
}

function renderErrorAnalysis(results) {
    const errorList = document.getElementById('error-list');
    errorList.innerHTML = '';
    
    const errors = results.filter(r => !r.isCorrect);
    
    if (errors.length === 0) {
        errorList.innerHTML = '<p style="color: var(--success-color);">🎉 太棒了！没有错误！</p>';
        return;
    }
    
    errors.forEach((error, index) => {
        const div = document.createElement('div');
        div.className = 'error-item';
        div.innerHTML = `
            <div>第${results.indexOf(error) + 1}句</div>
            <div>正确：<span class="expected">${error.original}</span></div>
            <div>你的：<span class="actual">${error.recited || '（未识别）'}</span></div>
        `;
        errorList.appendChild(div);
    });
}

function retryRecitation() {
    startRecitation();
}

function saveResult() {
    goHome();
}

// ==================== 历史记录 ====================
async function renderHistory() {
    try {
        const statsRes = await UserService.getStats();
        const stats = statsRes.data;
        
        document.getElementById('total-count').textContent = stats.totalSessions || 0;
        document.getElementById('avg-score').textContent = stats.avgScore || 0;
        document.getElementById('streak-days').textContent = stats.streakDays || 0;
        
        const historyRes = await UserService.getHistory(20);
        const historyItems = document.getElementById('history-items');
        
        if (historyItems && historyRes.data) {
            if (historyRes.data.length === 0) {
                historyItems.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">还没有背诵记录</p>';
            } else {
                historyItems.innerHTML = historyRes.data.map(record => {
                    const date = new Date(record.start_time);
                    return `
                        <div class="history-item">
                            <div class="info">
                                <div class="title">${record.title || '自定义内容'}</div>
                                <div class="date">${date.toLocaleDateString()} ${date.toLocaleTimeString()}</div>
                            </div>
                            <div class="score">${record.final_score || 0}分</div>
                        </div>
                    `;
                }).join('');
            }
        }
    } catch (err) {
        console.error('加载历史记录失败:', err);
    }
}

// ==================== 初始化 ====================
async function init() {
    // 尝试加载已保存的认证信息
    const hasAuth = AuthService.loadAuth();
    
    if (!hasAuth) {
        // 游客登录
        try {
            await AuthService.guestLogin();
            console.log('游客登录成功');
        } catch (err) {
            console.error('游客登录失败:', err);
        }
    }
    
    // 加载首页数据
    await loadHomeData();
    
    // 加载复习提醒
    await loadReviewReminder();
    
    // 默认选择跟读模式
    selectMode('repeat');
}

// ==================== 复习提醒功能 ====================
async function loadReviewReminder() {
    try {
        const res = await ReviewService.getToday();
        const reminderEl = document.getElementById('review-reminder');
        const contentEl = document.getElementById('reminder-content');
        
        if (res.data && res.data.tasks && res.data.tasks.length > 0) {
            const tasks = res.data.tasks;
            const titles = tasks.slice(0, 3).map(t => t.title).join('、');
            const moreText = tasks.length > 3 ? `等${tasks.length}篇` : '';
            
            contentEl.innerHTML = `<p>需要复习：${titles}${moreText}</p><p>预计时长：约${res.data.estimated_minutes}分钟</p>`;
            reminderEl.classList.remove('hidden');
            
            // 语音提醒
            if (AppState.settings.autoNext !== false) {
                setTimeout(() => {
                    speechSynthesizer.speak(`今天有${tasks.length}篇内容需要复习，加油！`);
                }, 2000);
            }
        } else {
            reminderEl.classList.add('hidden');
        }
    } catch (err) {
        console.error('加载复习提醒失败:', err);
    }
}

async function startReview() {
    try {
        const res = await ReviewService.getToday();
        if (res.data && res.data.tasks && res.data.tasks.length > 0) {
            // 选择第一个需要复习的内容
            const firstTask = res.data.tasks[0];
            await selectContent(firstTask.id);
        }
    } catch (err) {
        console.error('开始复习失败:', err);
    }
}

// ==================== 数据统计功能 ====================
async function showStats() {
    showPage('stats');
    await loadStatsData();
}

async function loadStatsData() {
    try {
        // 加载用户统计
        const statsRes = await UserService.getStats();
        const stats = statsRes.data;
        
        document.getElementById('stats-total-sessions').textContent = stats.totalSessions || 0;
        document.getElementById('stats-avg-score').textContent = Math.round(stats.avgScore || 0);
        document.getElementById('stats-streak').textContent = stats.streakDays || 0;
        document.getElementById('stats-mastered').textContent = stats.totalContentMastered || 0;
        
        // 加载本周数据
        await loadWeeklyChart();
        
        // 加载内容掌握情况
        await loadMasteryList();
    } catch (err) {
        console.error('加载统计数据失败:', err);
    }
}

async function loadWeeklyChart() {
    try {
        const res = await UserService.getHistory(100);
        const chartPlaceholder = document.getElementById('chart-placeholder');
        
        if (res.data && res.data.length > 0) {
            // 按天统计
            const today = new Date();
            const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
            const dailyData = {};
            
            for (let i = 6; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateKey = date.toISOString().split('T')[0];
                const dayName = weekDays[date.getDay()];
                dailyData[dateKey] = { day: dayName, count: 0, totalScore: 0 };
            }
            
            // 填充数据
            res.data.forEach(record => {
                const recordDate = record.start_time.split('T')[0];
                if (dailyData[recordDate]) {
                    dailyData[recordDate].count++;
                    dailyData[recordDate].totalScore += record.final_score || 0;
                }
            });
            
            // 渲染图表
            const maxCount = Math.max(...Object.values(dailyData).map(d => d.count), 1);
            
            let chartHtml = '<div class="chart-bars">';
            Object.values(dailyData).forEach(d => {
                const height = Math.max(10, (d.count / maxCount) * 80);
                const avgScore = d.count > 0 ? Math.round(d.totalScore / d.count) : 0;
                chartHtml += `
                    <div style="text-align: center;">
                        <div class="chart-bar" style="height: ${height}px;" title="${d.count}次，平均${avgScore}分"></div>
                        <div class="chart-label">周${d.day}</div>
                    </div>
                `;
            });
            chartHtml += '</div>';
            chartPlaceholder.innerHTML = chartHtml;
        } else {
            chartPlaceholder.innerHTML = '<p>暂无数据，开始学习吧！</p>';
        }
    } catch (err) {
        console.error('加载周报数据失败:', err);
    }
}

async function loadMasteryList() {
    try {
        // 从后端获取掌握情况
        const res = await apiRequest('/users/mastery');
        const masteryList = document.getElementById('mastery-list');
        
        if (res.data && res.data.length > 0) {
            masteryList.innerHTML = res.data.map(item => {
                const statusClass = item.status || 'learning';
                const statusText = {
                    'mastered': '已掌握',
                    'reviewing': '复习中',
                    'learning': '学习中'
                }[statusClass];
                
                return `
                    <div class="mastery-item">
                        <div class="mastery-title">${item.title || '自定义内容'}</div>
                        <div class="mastery-status ${statusClass}">${statusText}</div>
                    </div>
                `;
            }).join('');
        }
    } catch (err) {
        console.error('加载掌握情况失败:', err);
        // 显示友好提示
        const masteryList = document.getElementById('mastery-list');
        masteryList.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">暂无掌握数据</p>';
    }
}

document.addEventListener('DOMContentLoaded', init);

// 防止页面刷新时丢失数据
window.addEventListener('beforeunload', () => {
    // 保存必要的状态
});
