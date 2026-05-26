/**
 * 智能背诵助手 - DOM操作和UI更新
 */

// ==================== 工具函数 ====================

function showTextPrompt(text) {
    let promptEl = document.getElementById('text-prompt');
    if (!promptEl) {
        promptEl = document.createElement('div');
        promptEl.id = 'text-prompt';
        promptEl.className = 'text-prompt';
        document.body.appendChild(promptEl);
    }
    promptEl.textContent = text;
    promptEl.classList.add('visible');
}

function hideTextPrompt() {
    const promptEl = document.getElementById('text-prompt');
    if (promptEl) {
        promptEl.classList.remove('visible');
    }
}

function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
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
    updateHomeStats();
}

function goBack() {
    if (AppState.currentPage === 'preview') {
        showPage('text-input');
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

    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    document.querySelector(`[data-mode="${mode}"]`).classList.add('selected');
}

// ==================== 语音状态指示器 ====================

function updateVoiceIndicator(state, text = '') {
    const indicator = document.getElementById('voice-indicator');
    const voiceText = document.getElementById('voice-text');
    const waves = indicator.querySelector('.voice-waves');

    waves.classList.remove('listening', 'speaking', 'waiting', 'paused');
    indicator.classList.remove('state-speaking', 'state-listening', 'state-waiting', 'state-paused');

    if (state === 'speaking') {
        voiceText.textContent = `🔊 ${text.length > 15 ? text.slice(0, 15) + '...' : text}`;
        waves.classList.add('speaking');
        indicator.classList.add('state-speaking');
    } else if (state === 'listening') {
        voiceText.textContent = '🎤 正在听你说...';
        waves.classList.add('listening');
        indicator.classList.add('state-listening');
    } else if (state === 'waiting') {
        voiceText.textContent = '👆 点击麦克风开始';
        waves.classList.add('waiting');
        indicator.classList.add('state-waiting');
    } else if (state === 'paused') {
        voiceText.textContent = '⏸ 已暂停';
        waves.classList.add('paused');
        indicator.classList.add('state-paused');
    } else {
        voiceText.textContent = '准备开始';
    }
}

function updateMicButton(isListening) {
    const micBtn = document.getElementById('mic-btn');
    const micHint = document.getElementById('mic-hint');

    if (isListening) {
        micBtn.classList.add('listening');
        micHint.textContent = '正在录音，再次点击结束';
    } else {
        micBtn.classList.remove('listening');
        micHint.textContent = '点击开始录音';
    }
}

function updateSpeechResult(text, isFinal) {
    const resultDiv = document.getElementById('speech-result');
    const resultText = document.getElementById('speech-result-text');

    resultDiv.classList.remove('hidden');
    resultText.textContent = text;
    resultText.classList.toggle('final', isFinal);
}

function hideSpeechResult() {
    const resultDiv = document.getElementById('speech-result');
    resultDiv.classList.add('hidden');
}

function updateLanguageIndicator(lang) {
    const indicator = document.getElementById('language-indicator');
    if (indicator) {
        indicator.textContent = getLanguageName(lang);
        indicator.className = `lang-badge ${lang === 'en-US' ? 'lang-en' : 'lang-zh'}`;
    }
}

// ==================== 进度条 ====================

function updateProgress() {
    const currentIdx = AppState.recitation.currentIndex;
    const total = AppState.content.sentences.length;
    const progress = total > 0 ? (currentIdx / total) * 100 : 0;

    document.getElementById('progress-fill').style.width = `${progress}%`;
    document.getElementById('progress-percent').textContent = `${Math.round(progress)}%`;
    document.getElementById('sentence-counter').textContent = `第 ${currentIdx + 1} 句 / 共 ${total} 句`;
}

// ==================== 暂停/继续 ====================

function togglePause() {
    AppState.recitation.isPaused = !AppState.recitation.isPaused;
    updatePauseButton();

    if (AppState.recitation.isPaused) {
        speechSynthesizer.stop();
        speechRecognizer.stop();
        updateVoiceIndicator('paused');
    } else {
        updateVoiceIndicator('waiting');
        startCurrentSentence();
    }
}

function updatePauseButton() {
    const btn = document.getElementById('btn-pause');
    if (AppState.recitation.isPaused) {
        btn.innerHTML = '<span class="ctrl-icon">▶️</span><span class="ctrl-label">继续</span>';
        btn.classList.add('active');
    } else {
        btn.innerHTML = '<span class="ctrl-icon">⏸️</span><span class="ctrl-label">暂停</span>';
        btn.classList.remove('active');
    }
}

// ==================== 退出确认 ====================

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
    AppState.recitation.isPaused = false;
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

// ==================== 结果展示 ====================

/**
 * 计算准确度方差，用于评估背诵稳定性
 */
function calculateAccuracyVariance(results) {
    const validResults = results.filter(r => r && r.accuracy !== undefined);
    if (validResults.length <= 1) return 0;
    const mean = validResults.reduce((sum, r) => sum + r.accuracy, 0) / validResults.length;
    const variance = validResults.reduce((sum, r) => sum + Math.pow(r.accuracy - mean, 2), 0) / validResults.length;
    return Math.sqrt(variance);
}

function showResult(score, results) {
    showPage('result');

    animateScore(score);

    const stars = calculateStars(score);
    document.getElementById('stars').textContent = stars;

    document.getElementById('result-comment').textContent = getComment(score);

    const correctCount = results.filter(r => r && r.isCorrect).length;
    const avgAccuracy = results.reduce((sum, r) => sum + (r ? r.accuracy : 0), 0) / results.length;

    document.getElementById('accuracy-value').textContent = Math.round(avgAccuracy) + '%';
    document.getElementById('accuracy-bar').style.width = avgAccuracy + '%';

    const completeness = (correctCount / results.length) * 100;
    document.getElementById('completeness-value').textContent = Math.round(completeness) + '%';
    document.getElementById('completeness-bar').style.width = completeness + '%';

    // 流畅度评分：基于准确度和完整度的加权计算
    // 流畅度 = 准确度 * 0.4 + 完整度 * 0.3 + 稳定性 * 0.3
    // 稳定性：基于准确度方差（这里简化处理）
    const accuracyVariance = calculateAccuracyVariance(results);
    const stability = Math.max(0, 100 - accuracyVariance * 2);
    const fluency = Math.min(100, avgAccuracy * 0.4 + completeness * 0.3 + stability * 0.3);
    document.getElementById('fluency-value').textContent = Math.round(fluency) + '%';
    document.getElementById('fluency-bar').style.width = fluency + '%';

    renderErrorAnalysis(results);

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

    const errors = results.filter(r => r && !r.isCorrect);

    if (errors.length === 0) {
        errorList.innerHTML = '<p style="color: var(--success-color);">🎉 太棒了！没有错误！</p>';
        return;
    }

    errors.forEach((error) => {
        const idx = results.indexOf(error);
        const div = document.createElement('div');
        div.className = 'error-item';
        div.innerHTML = `
            <div>第${idx + 1}句</div>
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

    const totalScore = AppState.history.records.reduce((sum, r) => sum + r.score, 0);
    AppState.history.stats.avgScore = Math.round(totalScore / AppState.history.records.length);

    checkAchievements();
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
    document.getElementById('total-count').textContent = AppState.history.stats.totalCount;
    document.getElementById('avg-score').textContent = AppState.history.stats.avgScore;
    document.getElementById('streak-days').textContent = AppState.history.stats.streakDays;

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