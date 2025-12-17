const path = require('path');

const DATA_DIR = process.env.DATA_PATH || path.join(__dirname, '../data');

module.exports = {
    DATA_DIR,
    LEXICON: path.join(DATA_DIR, 'lexicon.json'),
    DOC_STORE: path.join(DATA_DIR, 'docStore.json'),
    FORWARD_INDEX: path.join(DATA_DIR, 'forwardIndex.json'),
    INVERTED_INDEX: path.join(DATA_DIR, 'invertedIndex.json'),
    BARRELS: path.join(DATA_DIR, 'barrels'),
    GLOVE: path.join(DATA_DIR, process.env.GLOVE_FILE_NAME || 'glove.6B.50d.txt'),
    RAW_INPUT: path.join(DATA_DIR, 'arxiv.json')
};