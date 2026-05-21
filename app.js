/**
 * 智能背诵助手 - 核心应用逻辑
 */

// ==================== 全局状态 ====================
const AppState = {
    currentPage: 'home',
    content: {
        title: '',
        text: '',
        sentences: []
    },
    settings: {
        speechRate: 0.9,
        speechVolume: 1,
        autoNext: true
    },
    recitation: {
        mode: 'repeat', // repeat, fill, hint, full
        currentIndex: 0,
        results: [],
        isListening: false,
        isSpeaking: false
    },
    history: {
        records: [],
        achievements: [],
        stats: {
            totalCount: 0,
            avgScore: 0,
            streakDays: 0,
            todayCount: 0
        }
    }
};

// ==================== 语音合成 ====================
class SpeechSynthesizer {
    constructor() {
        this.synth = window.speechSynthesis;
        this.voice = null;
        this.init();
    }

    init() {
        // 等待语音列表加载
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = () => this.setVoice();
        }
        this.setVoice();
    }

    setVoice() {
        const voices = this.synth.getVoices();
        // 优先选择中文女声
        this.voice = voices.find(v => v.lang.includes('zh') && v.name.includes('Female')) ||
                     voices.find(v => v.lang.includes('zh')) ||
                     voices[0];
    }

    speak(text, onEnd = null) {
        if (!this.synth) return;

        // 取消之前的语音
        this.synth.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = this.voice;
        utterance.rate = AppState.settings.speechRate;
        utterance.volume = AppState.settings.speechVolume;
        utterance.pitch = 1.1; // 稍微提高音调，更亲切

        AppState.recitation.isSpeaking = true;
        updateVoiceIndicator('speaking', text);

        utterance.onend = () => {
            AppState.recitation.isSpeaking = false;
            updateVoiceIndicator('idle');
            if (onEnd) onEnd();
        };

        utterance.onerror = (e) => {
            console.error('语音合成错误:', e);
            AppState.recitation.isSpeaking = false;
            updateVoiceIndicator('idle');
        };

        this.synth.speak(utterance);
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
        this.init();
    }

    init() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('浏览器不支持语音识别');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'zh-CN';
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;
    }

    start(onResult, onEnd, onError) {
        if (!this.recognition) {
            // 模拟语音识别（用于测试）
            simulateSpeechRecognition(onResult, onEnd);
            return;
        }

        let finalTranscript = '';

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
            AppState.recitation.isListening = false;
            updateMicButton(false);
            if (onEnd) onEnd(finalTranscript);
        };

        this.recognition.onerror = (e) => {
            console.error('语音识别错误:', e);
            AppState.recitation.isListening = false;
            updateMicButton(false);
            if (onError) onError(e);
        };

        AppState.recitation.isListening = true;
        updateMicButton(true);
        this.recognition.start();
    }

    stop() {
        if (this.recognition) {
            this.recognition.stop();
        }
        AppState.recitation.isListening = false;
        updateMicButton(false);
    }
}

const speechRecognizer = new SpeechRecognizer();

// 模拟语音识别（测试用）
function simulateSpeechRecognition(onResult, onEnd) {
    AppState.recitation.isListening = true;
    updateMicButton(true);
    
    // 模拟识别延迟
    setTimeout(() => {
        const currentSentence = AppState.content.sentences[AppState.recitation.currentIndex];
        // 随机模拟正确或错误
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
    // 隐藏所有页面
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // 显示目标页面
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
    updateHomeStats();
}

function goBack() {
    if (AppState.currentPage === 'preview') {
        showPage('text');
    } else {
        goHome();
    }
}

// ==================== 首页功能 ====================
function showTextInput() {
    showPage('text-input');
}

function showImageInput() {
    showPage('image-input');
    initImageUpload();
}

function showHistory() {
    showPage('history');
    renderHistory();
}

function updateHomeStats() {
    const todayCount = AppState.history.stats.todayCount || 0;
    document.getElementById('today-count').textContent = todayCount;
}

// ==================== 文字输入功能 ====================
function previewContent() {
    const text = document.getElementById('content-text').value.trim();
    if (!text) { alert('请输入要背诵的内容'); return; }
    AppState.content.title = text.slice(0, 10) + (text.length > 10 ? '...' : '');
    AppState.content.text = text;
    AppState.content.sentences = splitIntoSentences(text);
    
    renderContentPreview();
    showPage('preview');
}

function splitIntoSentences(text) {
    // 按标点符号分割句子
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

// ==================== 图片输入功能 ====================
function initImageUpload() {
    const uploadArea = document.getElementById('upload-area');
    const imageInput = document.getElementById('image-input');
    
    uploadArea.addEventListener('click', () => imageInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--primary-color)';
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = 'var(--border-color)';
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--border-color)';
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            handleImageFile(file);
        }
    });
    
    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleImageFile(file);
        }
    });
}

function handleImageFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('preview-img').src = e.target.result;
        document.getElementById('upload-area').classList.add('hidden');
        document.getElementById('image-preview').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function resetImage() {
    document.getElementById('image-input').value = '';
    document.getElementById('upload-area').classList.remove('hidden');
    document.getElementById('image-preview').classList.add('hidden');
    document.getElementById('ocr-result').classList.add('hidden');
}

function recognizeImage() {
    // 模拟OCR识别
    const btn = event.target;
    btn.textContent = '识别中...';
    btn.disabled = true;
    
    setTimeout(() => {
        // 模拟识别结果
        const mockText = '床前明月光，\n疑是地上霜。\n举头望明月，\n低头思故乡。';
        document.getElementById('ocr-text').value = mockText;
        document.getElementById('ocr-result').classList.remove('hidden');
        btn.textContent = '识别文字';
        btn.disabled = false;
    }, 2000);
}

function previewOCRContent() {
    const text = document.getElementById('ocr-text').value.trim();
    if (!text) {
        alert('请先识别文字');
        return;
    }
    
    AppState.content.title = '图片识别内容';
    AppState.content.text = text;
    AppState.content.sentences = splitIntoSentences(text);
    
    renderContentPreview();
    showPage('preview');
}

// ==================== 模式选择 ====================
function selectMode(mode) {
    AppState.recitation.mode = mode;
    
    // 更新UI
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    document.querySelector(`[data-mode="${mode}"]`).classList.add('selected');
}

// ==================== 背诵功能 ====================
function startRecitation() {
    AppState.recitation.currentIndex = 0;
    AppState.recitation.results = [];
    
    document.getElementById('recitation-title').textContent = AppState.content.title;
    renderRecitationContent();
    updateProgress();
    
    showPage('recitation');
    
    // 开场语音
    setTimeout(() => {
        const openingText = `同学们好！今天我们来背诵《${AppState.content.title}》。准备好了吗？让我们开始吧！`;
        speechSynthesizer.speak(openingText, () => {
            startCurrentSentence();
        });
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
            // 填空模式：显示前半句
            const halfLength = Math.ceil(sentence.length / 2);
            div.innerHTML = `${sentence.slice(0, halfLength)}<span class="fill-blank">?</span>`;
        } else if (AppState.recitation.mode === 'hint' && index === AppState.recitation.currentIndex) {
            // 提示模式：显示首字
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
    
    renderRecitationContent();
    
    if (mode === 'repeat') {
        // 跟读模式
        speechSynthesizer.speak(`跟我一起读：'${currentSentence}'——`, () => {
            updateVoiceIndicator('listening');
        });
    } else if (mode === 'fill') {
        // 填空模式
        const halfLength = Math.ceil(currentSentence.length / 2);
        const prefix = currentSentence.slice(0, halfLength);
        speechSynthesizer.speak(`'${prefix}'，接下来是什么？`, () => {
            updateVoiceIndicator('listening');
        });
    } else if (mode === 'hint') {
        // 提示模式
        speechSynthesizer.speak(`第一个字是'${currentSentence[0]}'，想一想后面是什么？`, () => {
            updateVoiceIndicator('listening');
        });
    } else if (mode === 'full') {
        // 完整背诵模式
        if (AppState.recitation.currentIndex === 0) {
            speechSynthesizer.speak('请开始背诵', () => {
                updateVoiceIndicator('listening');
            });
        } else {
            updateVoiceIndicator('listening');
        }
    }
}

function updateVoiceIndicator(state, text = '') {
    const indicator = document.getElementById('voice-indicator');
    const voiceText = document.getElementById('voice-text');
    const waves = indicator.querySelector('.voice-waves');
    
    if (state === 'speaking') {
        voiceText.textContent = `🎵 ${text.slice(0, 20)}...`;
        waves.classList.remove('listening');
    } else if (state === 'listening') {
        voiceText.textContent = '🎤 正在听...';
        waves.classList.add('listening');
    } else {
        voiceText.textContent = '点击开始';
        waves.classList.remove('listening');
    }
}

function updateMicButton(isListening) {
    const micBtn = document.getElementById('mic-btn');
    if (isListening) {
        micBtn.classList.add('listening');
    } else {
        micBtn.classList.remove('listening');
    }
}

// ==================== 麦克风控制 ====================
function startListening() {
    if (AppState.recitation.isSpeaking) {
        speechSynthesizer.stop();
    }
    
    speechRecognizer.start(
        (text, isFinal) => {
            // 实时识别结果
            if (isFinal) {
                handleRecitationResult(text);
            }
        },
        (finalText) => {
            // 识别结束
            if (finalText) {
                handleRecitationResult(finalText);
            }
        },
        (error) => {
            console.error('识别错误:', error);
            updateVoiceIndicator('idle');
        }
    );
}

function stopListening() {
    speechRecognizer.stop();
}

function handleRecitationResult(recitedText) {
    const currentIndex = AppState.recitation.currentIndex;
    const currentSentence = AppState.content.sentences[currentIndex];
    
    // 评估背诵结果
    const evaluation = evaluateRecitation(currentSentence, recitedText);
    
    // 保存结果
    AppState.recitation.results[currentIndex] = evaluation;
    
    // 反馈
    if (evaluation.isCorrect) {
        const encouragements = ['很好！', '不错！', '真棒！', '非常好！'];
        const randomEncouragement = encouragements[Math.floor(Math.random() * encouragements.length)];
        speechSynthesizer.speak(randomEncouragement, () => {
            nextSentence();
        });
    } else {
        speechSynthesizer.speak(`接近了，应该是'${currentSentence}'，我们再来一遍~`, () => {
            // 重新尝试当前句子
            setTimeout(() => startCurrentSentence(), 500);
        });
    }
}

function evaluateRecitation(original, recited) {
    // 预处理文本
    const cleanOriginal = preprocessText(original);
    const cleanRecited = preprocessText(recited);
    
    // 计算相似度
    const similarity = calculateSimilarity(cleanOriginal, cleanRecited);
    
    // 准确度阈值
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
    return text
        .replace(/[，。！？、；：""''（）【】]/g, '')
        .replace(/\s/g, '')
        .toLowerCase();
}

function calculateSimilarity(str1, str2) {
    // 简化的相似度计算
    if (str1 === str2) return 1;
    
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = [];
    
    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }
    
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
    
    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    return 1 - distance / maxLen;
}

function nextSentence() {
    AppState.recitation.currentIndex++;
    updateProgress();
    
    if (AppState.recitation.currentIndex >= AppState.content.sentences.length) {
        // 背诵完成
        finishRecitation();
    } else {
        // 继续下一句
        setTimeout(() => startCurrentSentence(), 500);
    }
}

function finishRecitation() {
    const results = AppState.recitation.results;
    const correctCount = results.filter(r => r.isCorrect).length;
    const totalCount = results.length;
    
    // 计算总分
    const avgAccuracy = results.reduce((sum, r) => sum + r.accuracy, 0) / totalCount;
    const completeness = (correctCount / totalCount) * 100;
    const score = Math.round(avgAccuracy * 0.6 + completeness * 0.4);
    
    // 保存到历史记录
    saveRecitationRecord(score, results);
    
    // 显示结果
    showResult(score, results);
}

// ==================== 控制按钮 ====================
function repeatCurrent() {
    speechSynthesizer.stop();
    speechRecognizer.stop();
    startCurrentSentence();
}

function showHint() {
    const currentSentence = AppState.content.sentences[AppState.recitation.currentIndex];
    speechSynthesizer.speak(`提示：${currentSentence.slice(0, 3)}...`);
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

// 设置监听器
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
    
    // 动画显示分数
    animateScore(score);
    
    // 显示星星
    const stars = calculateStars(score);
    document.getElementById('stars').textContent = stars;
    
    // 显示评语
    document.getElementById('result-comment').textContent = getComment(score);
    
    // 显示详细分析
    const correctCount = results.filter(r => r.isCorrect).length;
    const avgAccuracy = results.reduce((sum, r) => sum + r.accuracy, 0) / results.length;
    
    document.getElementById('accuracy-value').textContent = Math.round(avgAccuracy) + '%';
    document.getElementById('accuracy-bar').style.width = avgAccuracy + '%';
    
    const completeness = (correctCount / results.length) * 100;
    document.getElementById('completeness-value').textContent = Math.round(completeness) + '%';
    document.getElementById('completeness-bar').style.width = completeness + '%';
    
    // 模拟流畅度
    const fluency = Math.min(100, score + Math.random() * 20 - 10);
    document.getElementById('fluency-value').textContent = Math.round(fluency) + '%';
    document.getElementById('fluency-bar').style.width = fluency + '%';
    
    // 显示错误分析
    renderErrorAnalysis(results);
    
    // 播放结束语音
    const closingText = getClosingText(score);
    setTimeout(() => {
        speechSynthesizer.speak(closingText);
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
    if (score >= 90) return '完美！你可以当小老师了！';
    if (score >= 75) return '非常棒！再练习几次就能满分了！';
    if (score >= 60) return '不错！继续加油，下次会更好！';
    if (score >= 40) return '有进步！我们再来一遍~';
    return '没关系，多练习就能记住！';
}

function getClosingText(score) {
    if (score >= 90) return '太棒了！你已经完全掌握了！给自己鼓鼓掌吧！';
    if (score >= 75) return '很不错！再练习几次会更熟练！';
    if (score >= 60) return '有进步！继续加油！';
    return '没关系，多练习就能记住！下次一定能更好！';
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
function saveRecitationRecord(score, results) {
    const record = {
        id: Date.now(),
        title: AppState.content.title,
        score: score,
        date: new Date().toISOString(),
        results: results
    };
    
    AppState.history.records.unshift(record);
    AppState.history.stats.totalCount++;
    AppState.history.stats.todayCount++;
    
    // 更新平均分
    const totalScore = AppState.history.records.reduce((sum, r) => sum + r.score, 0);
    AppState.history.stats.avgScore = Math.round(totalScore / AppState.history.records.length);
    
    // 检查成就
    checkAchievements();
    
    // 保存到本地存储
    saveToLocalStorage();
}

function checkAchievements() {
    const achievements = [
        { id: 'first', icon: '🏆', name: '背诵新手', condition: () => AppState.history.stats.totalCount >= 1 },
        { id: 'ten', icon: '📚', name: '积累达人', condition: () => AppState.history.stats.totalCount >= 10 },
        { id: 'perfect', icon: '⭐', name: '满分王者', condition: () => AppState.history.records.some(r => r.score >= 90) },
        { id: 'streak', icon: '🔥', name: '连续打卡', condition: () => AppState.history.stats.streakDays >= 7 }
    ];
    
    achievements.forEach(achievement => {
        if (achievement.condition() && !AppState.history.achievements.find(a => a.id === achievement.id)) {
            AppState.history.achievements.push({
                id: achievement.id,
                icon: achievement.icon,
                name: achievement.name,
                unlockedAt: new Date().toISOString()
            });
        }
    });
}

function renderHistory() {
    // 更新统计
    document.getElementById('total-count').textContent = AppState.history.stats.totalCount;
    document.getElementById('avg-score').textContent = AppState.history.stats.avgScore;
    document.getElementById('streak-days').textContent = AppState.history.stats.streakDays;
    
    // 渲染成就
    const achievementList = document.getElementById('achievement-list');
    achievementList.innerHTML = '';
    
    const allAchievements = [
        { id: 'first', icon: '🏆', name: '背诵新手' },
        { id: 'ten', icon: '📚', name: '积累达人' },
        { id: 'perfect', icon: '⭐', name: '满分王者' },
        { id: 'streak', icon: '🔥', name: '连续打卡' }
    ];
    
    allAchievements.forEach(achievement => {
        const isUnlocked = AppState.history.achievements.find(a => a.id === achievement.id);
        const div = document.createElement('div');
        div.className = `achievement-item ${isUnlocked ? 'unlocked' : ''}`;
        div.innerHTML = `
            <span class="icon">${achievement.icon}</span>
            <span>${achievement.name}</span>
        `;
        achievementList.appendChild(div);
    });
    
    // 渲染历史记录
    const historyItems = document.getElementById('history-items');
    historyItems.innerHTML = '';
    
    if (AppState.history.records.length === 0) {
        historyItems.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">还没有背诵记录，快去开始第一次吧！</p>';
        return;
    }
    
    AppState.history.records.slice(0, 10).forEach(record => {
        const div = document.createElement('div');
        div.className = 'history-item';
        const date = new Date(record.date);
        div.innerHTML = `
            <div class="info">
                <div class="title">${record.title}</div>
                <div class="date">${date.toLocaleDateString()} ${date.toLocaleTimeString()}</div>
            </div>
            <div class="score">${record.score}分</div>
        `;
        historyItems.appendChild(div);
    });
}

// ==================== 本地存储 ====================
function saveToLocalStorage() {
    try {
        localStorage.setItem('recitationHelper_history', JSON.stringify(AppState.history));
    } catch (e) {
        console.error('保存失败:', e);
    }
}

function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('recitationHelper_history');
        if (saved) {
            AppState.history = JSON.parse(saved);
        }
    } catch (e) {
        console.error('加载失败:', e);
    }
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    updateHomeStats();
    
    // 默认选择跟读模式
    selectMode('repeat');
});

// 防止页面刷新时丢失数据
window.addEventListener('beforeunload', () => {
    saveToLocalStorage();
});
