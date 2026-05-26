/**
 * 智能背诵助手 - 四种背诵模式逻辑
 */

// ==================== 背诵模式核心逻辑 ====================

/**
 * 开始背诵
 */
function startRecitation() {
    AppState.recitation.currentIndex = 0;
    AppState.recitation.results = [];
    AppState.recitation.isPaused = false;
    AppState.recitation.hintLevel = 0;
    AppState.recitation.retryCount = 0;

    const detectedLang = detectLanguage(AppState.content.text);
    AppState.content.language = detectedLang;

    const useLang = AppState.settings.language === 'auto' ? detectedLang : AppState.settings.language;

    speechSynthesizer.setLanguage(useLang);
    speechRecognizer.setLanguage(useLang);

    updateLanguageIndicator(useLang);

    document.getElementById('recitation-title').textContent = AppState.content.title;
    renderRecitationContent();
    updateProgress();
    updatePauseButton();

    showPage('recitation');

    setTimeout(() => {
        let openingText;
        if (useLang === 'en-US') {
            openingText = `Hello everyone! Today we will recite "${AppState.content.title}". Are you ready? Let's begin!`;
        } else {
            openingText = `同学们好！今天我们来背诵《${AppState.content.title}》。准备好了吗？让我们开始吧！`;
        }
        speechSynthesizer.speak(openingText, () => {
            startCurrentSentence();
        });
    }, 500);
}

/**
 * 渲染背诵内容
 */
function renderRecitationContent() {
    const container = document.getElementById('content-display');
    container.innerHTML = '';

    const currentIdx = AppState.recitation.currentIndex;
    const total = AppState.content.sentences.length;

    AppState.content.sentences.forEach((sentence, index) => {
        const div = document.createElement('div');
        div.className = 'sentence-item';
        div.id = `sentence-${index}`;

        const distance = Math.abs(index - currentIdx);

        if (index === currentIdx) {
            div.classList.add('current');

            if (AppState.recitation.mode === 'fill') {
                const fillContent = getFillContent(sentence, AppState.recitation.hintLevel);
                div.innerHTML = fillContent;
            } else if (AppState.recitation.mode === 'hint') {
                const hintContent = getHintContent(sentence, AppState.recitation.hintLevel);
                div.innerHTML = hintContent;
            } else {
                div.textContent = sentence;
            }
        } else if (index < currentIdx) {
            const result = AppState.recitation.results[index];
            div.classList.add(result && result.isCorrect ? 'completed' : 'error');
            div.textContent = sentence;

            if (distance > 2) {
                div.classList.add('collapsed');
            }
        } else {
            div.textContent = sentence;

            if (distance > 2) {
                div.classList.add('collapsed');
            }
        }

        container.appendChild(div);
    });

    const currentEl = document.getElementById(`sentence-${currentIdx}`);
    if (currentEl) {
        currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

/**
 * 填空模式：按标点智能断句，支持渐进提示
 */
function getFillContent(sentence, hintLevel) {
    const lang = AppState.settings.language === 'auto' ? AppState.content.language : AppState.settings.language;
    const isEnglish = lang === 'en-US';

    let prefix, suffix;

    if (isEnglish) {
        const words = sentence.split(' ');
        const splitPos = Math.ceil(words.length / 2);
        prefix = words.slice(0, splitPos).join(' ');
        suffix = words.slice(splitPos).join(' ');
    } else {
        const punctuationMatch = sentence.match(/[，。！？、；：""''）】]/g);
        let splitPos;
        if (punctuationMatch && punctuationMatch.length > 0) {
            const midPunctIdx = Math.floor(punctuationMatch.length / 2);
            let count = 0;
            for (let i = 0; i < sentence.length; i++) {
                if (/[，。！？、；：""''）】]/.test(sentence[i])) {
                    if (count === midPunctIdx) {
                        splitPos = i + 1;
                        break;
                    }
                    count++;
                }
            }
        }
        if (!splitPos) splitPos = Math.ceil(sentence.length / 2);
        prefix = sentence.slice(0, splitPos);
        suffix = sentence.slice(splitPos);
    }

    if (hintLevel === 0) {
        return `${prefix}<span class="fill-blank">______</span>`;
    } else if (hintLevel === 1) {
        const hint = isEnglish
            ? (suffix.split(' ')[0] || suffix) + '...'
            : suffix[0] + '...';
        return `${prefix}<span class="fill-blank">${hint}</span>`;
    } else {
        return `${prefix}<span class="fill-blank revealed">${suffix}</span>`;
    }
}

/**
 * 提示模式：渐进显示内容
 */
function getHintContent(sentence, hintLevel) {
    const lang = AppState.settings.language === 'auto' ? AppState.content.language : AppState.settings.language;
    const isEnglish = lang === 'en-US';

    if (isEnglish) {
        const words = sentence.split(' ');
        if (hintLevel === 0) {
            return `<span class="hint-text">${words[0]}</span><span class="hint-hidden">${' ▪'.repeat(words.length - 1)}</span>`;
        } else if (hintLevel === 1) {
            const showCount = Math.max(1, Math.ceil(words.length / 3));
            return `<span class="hint-text">${words.slice(0, showCount).join(' ')}</span><span class="hint-hidden">${' ▪'.repeat(words.length - showCount)}</span>`;
        } else if (hintLevel === 2) {
            const showCount = Math.max(1, Math.ceil(words.length * 2 / 3));
            return `<span class="hint-text">${words.slice(0, showCount).join(' ')}</span><span class="hint-hidden">${' ▪'.repeat(words.length - showCount)}</span>`;
        } else {
            return `<span class="hint-text">${sentence}</span>`;
        }
    } else {
        if (hintLevel === 0) {
            return `<span class="hint-text">${sentence[0]}</span><span class="hint-hidden">${'▪'.repeat(sentence.length - 1)}</span>`;
        } else if (hintLevel === 1) {
            const showLen = Math.max(1, Math.ceil(sentence.length / 3));
            return `<span class="hint-text">${sentence.slice(0, showLen)}</span><span class="hint-hidden">${'▪'.repeat(sentence.length - showLen)}</span>`;
        } else if (hintLevel === 2) {
            const showLen = Math.max(1, Math.ceil(sentence.length * 2 / 3));
            return `<span class="hint-text">${sentence.slice(0, showLen)}</span><span class="hint-hidden">${'▪'.repeat(sentence.length - showLen)}</span>`;
        } else {
            return `<span class="hint-text">${sentence}</span>`;
        }
    }
}

/**
 * 开始当前句子的朗读/提示
 */
function startCurrentSentence() {
    if (AppState.recitation.isPaused) return;

    const currentSentence = AppState.content.sentences[AppState.recitation.currentIndex];
    const mode = AppState.recitation.mode;
    const lang = AppState.settings.language === 'auto' ? AppState.content.language : AppState.settings.language;
    const isEnglish = lang === 'en-US';

    AppState.recitation.hintLevel = 0;
    renderRecitationContent();
    hideSpeechResult();

    if (mode === 'repeat') {
        const prompt = isEnglish
            ? `Repeat after me: "${currentSentence}" ——`
            : `跟我一起读：${currentSentence}——`;
        speechSynthesizer.speak(prompt, () => {
            updateVoiceIndicator('waiting');
        });
    } else if (mode === 'fill') {
        let splitPos;
        if (isEnglish) {
            const words = currentSentence.split(' ');
            splitPos = Math.ceil(words.length / 2);
            const prefix = words.slice(0, splitPos).join(' ');
            const prompt = `${prefix}... What's next?`;
            speechSynthesizer.speak(prompt, () => {
                updateVoiceIndicator('waiting');
            });
        } else {
            const punctuationMatch = currentSentence.match(/[，。！？、；：""''）】]/g);
            if (punctuationMatch && punctuationMatch.length > 0) {
                const midPunctIdx = Math.floor(punctuationMatch.length / 2);
                let count = 0;
                for (let i = 0; i < currentSentence.length; i++) {
                    if (/[，。！？、；：""''）】]/.test(currentSentence[i])) {
                        if (count === midPunctIdx) {
                            splitPos = i + 1;
                            break;
                        }
                        count++;
                    }
                }
            }
            if (!splitPos) splitPos = Math.ceil(currentSentence.length / 2);
            const prefix = currentSentence.slice(0, splitPos);
            speechSynthesizer.speak(`${prefix}，接下来是什么？`, () => {
                updateVoiceIndicator('waiting');
            });
        }
    } else if (mode === 'hint') {
        if (isEnglish) {
            const firstWord = currentSentence.split(' ')[0];
            speechSynthesizer.speak(`The first word is "${firstWord}". What comes next?`, () => {
                updateVoiceIndicator('waiting');
            });
        } else {
            speechSynthesizer.speak(`第一个字是"${currentSentence[0]}"，想一想后面是什么？`, () => {
                updateVoiceIndicator('waiting');
            });
        }
    } else if (mode === 'full') {
        if (AppState.recitation.currentIndex === 0) {
            const prompt = isEnglish ? 'Please start reciting' : '请开始背诵';
            speechSynthesizer.speak(prompt, () => {
                updateVoiceIndicator('waiting');
            });
        } else {
            updateVoiceIndicator('waiting');
        }
    }
}

/**
 * 重读当前句
 */
function repeatCurrent() {
    if (AppState.recitation.isPaused) return;
    speechSynthesizer.stop();
    speechRecognizer.stop();
    hideSpeechResult();
    startCurrentSentence();
}

/**
 * 渐进提示
 */
function showHint() {
    if (AppState.recitation.isPaused) return;

    const maxHintLevel = 3;
    AppState.recitation.hintLevel = Math.min(AppState.recitation.hintLevel + 1, maxHintLevel);

    renderRecitationContent();

    const currentSentence = AppState.content.sentences[AppState.recitation.currentIndex];
    const lang = AppState.settings.language === 'auto' ? AppState.content.language : AppState.settings.language;
    const isEnglish = lang === 'en-US';

    if (AppState.recitation.hintLevel >= maxHintLevel) {
        const msg = isEnglish
            ? `The answer is "${currentSentence}". Remember it!`
            : `答案是"${currentSentence}"，记住它！`;
        speechSynthesizer.speak(msg);
    } else {
        let hintTexts;
        if (isEnglish) {
            const words = currentSentence.split(' ');
            hintTexts = [
                `Think again. Hint: ${words.slice(0, 2).join(' ')}...`,
                `Another hint: ${words.slice(0, Math.ceil(words.length / 2)).join(' ')}...`,
                `Last hint: ${words.slice(0, Math.ceil(words.length * 2 / 3)).join(' ')}...`
            ];
        } else {
            hintTexts = [
                `再想想，提示：${currentSentence.slice(0, 2)}...`,
                `再提示一下：${currentSentence.slice(0, Math.ceil(currentSentence.length / 2))}...`,
                `最后一个提示：${currentSentence.slice(0, Math.ceil(currentSentence.length * 2 / 3))}...`
            ];
        }
        speechSynthesizer.speak(hintTexts[AppState.recitation.hintLevel - 1] || hintTexts[0]);
    }
}

/**
 * 跳过当前句
 */
function skipCurrent() {
    speechSynthesizer.stop();
    speechRecognizer.stop();
    hideSpeechResult();

    const currentSentence = AppState.content.sentences[AppState.recitation.currentIndex];
    AppState.recitation.results[AppState.recitation.currentIndex] = {
        original: currentSentence,
        recited: '（已跳过）',
        similarity: 0,
        isCorrect: false,
        accuracy: 0
    };
    nextSentence();
}

/**
 * 下一句
 */
function nextSentence() {
    AppState.recitation.currentIndex++;
    AppState.recitation.retryCount = 0;
    AppState.recitation.hintLevel = 0;
    updateProgress();

    if (AppState.recitation.currentIndex >= AppState.content.sentences.length) {
        finishRecitation();
    } else {
        setTimeout(() => startCurrentSentence(), 500);
    }
}

/**
 * 完成背诵
 */
function finishRecitation() {
    const results = AppState.recitation.results;
    const correctCount = results.filter(r => r && r.isCorrect).length;
    const totalCount = results.length;

    const avgAccuracy = results.reduce((sum, r) => sum + (r ? r.accuracy : 0), 0) / totalCount;
    const completeness = (correctCount / totalCount) * 100;
    const score = Math.round(avgAccuracy * 0.6 + completeness * 0.4);

    saveRecitationRecord(score, results);
    showResult(score, results);
}