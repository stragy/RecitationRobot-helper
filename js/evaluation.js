/**
 * 智能背诵助手 - 背诵评估（Levenshtein等）
 */

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
    return text
        .replace(/[，。！？、；：""''（）【】]/g, '')
        .replace(/\s/g, '')
        .toLowerCase();
}

function calculateSimilarity(str1, str2) {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

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