var lex = (function () {
    var text = '', offset = 0, limit = text.length;

    function isDecimalDigit(code) {
        return code >= 48 && code <= 57; // [0-9]
    }

    function isHexDigit(code) {
        return code >= 48 && code <= 57 || // [0-9]
               code >= 65 && code <= 70 || // [A-F]
               code >= 97 && code <= 102;  // [a-f]
    }

    function readDecimalDigits() {
        var startOffset = offset;

        while (offset < limit && isDecimalDigit(text.charCodeAt(offset))) {
            offset++;
        }

        return startOffset < offset;
    }

    // nmstart   [_a-z]|{nonascii}|{escape}
    function readNmstart(codes) {
        var code = text.charCodeAt(offset);
        if (code === 45/*-*/ ||
            code >= 48 && code <= 57) { // [0-9]
            return false;
        }
        return readNmchar(codes);
    }

    // nmchar    [_a-z0-9-]|{nonascii}|{escape}
    function readNmchar(codes) {
        var code = text.charCodeAt(offset);
        if (code === 45/*-*/ || code === 95/*_*/ ||
            code >= 48 && code <= 57 ||  // [0-9]
            code >= 65 && code <= 90 ||  // [A-Z]
            code >= 97 && code <= 122) { // [a-z]
            offset++;
            codes.push(code);
            return true;
        }
        return readNonascii(codes) || readEscape(codes);
    }

    // nonascii  [^\0-\177]
    function readNonascii(codes) {
        var code = text.charCodeAt(offset);
        if (code > 127) {
            codes.push(code);
            offset++;
            return true;
        }
        return false;
    }

    // escape    {unicode}|\\[^\n\r\f0-9a-f]
    function readEscape(codes) {
        var code = text.charCodeAt(offset),
            statOffset, max;

        if (code === 92/*\*/) {
            offset++;

            if (offset < limit) {
                code = text.charCodeAt(offset);

                if (isHexDigit(code)) {
                    startOffset = offset++;

                    for (max = 5; max-- && offset < limit &&
                                  isHexDigit(text.charCodeAt(offset)) ;) {
                        offset++;
                    }

                    // TODO: surrogate pair
                    codes.push(parseInt(text.slice(startOffset, offset), 16));

                    if (offset < limit) {
                        code = text.charCodeAt(offset);

                        if (code === 13/*\r*/) {
                            offset++;

                            if (text.charCodeAt(offset) === 10/*\n*/) {
                                offset++;
                            }
                        } else if (code === 32/* */ || code === 9/*\t*/ ||
                                   code === 10/*\n*/ || code === 12/*\f*/) {
                            offset++;
                        }
                    }

                    return true;
                }

                if (code !== 10/*\n*/ && code !== 12/*\f*/ && code !== 13/*\r*/) {
                    offset++;
                    codes.push(code);
                    return true;
                }
            }

            offset--;
        }

        return false;
    }

    // nl        \n|\r\n|\r|\f
    function readNl() {
        var code = text.charCodeAt(offset);

        if (code === 10/*\n*/ || code === 12/*\f*/) {
            offset++;
            return true;
        }

        if (code === 13/*\r*/) {
            offset++;

            if (text.charCodeAt(offset) === 10/*\n*/) {
                offset++;
            }

            return true;
        }

        return false;
    }

    // ident     [-]?{nmstart}{nmchar}*
    function readIdentifierToken() {
        var codes = [],
            offset1 = offset,
            code = text.charCodeAt(offset1);

        if (code === 45/*-*/) {
            offset++;
            codes[0] = 45;
        }

        if (offset < limit && readNmstart(codes)) {
            while (offset < limit && readNmchar(codes));

            return {
                type: 'Identifier',
                value: String.fromCharCode.apply(null, codes)
            };
        }

        offset = offset1;
        return null;
    }

    // string    {string1}|{string2}
    // string1   \"([^\n\r\f\\"]|\\{nl}|{nonascii}|{escape})*\"
    // string2   \'([^\n\r\f\\']|\\{nl}|{nonascii}|{escape})*\'
    function readStringToken() {
        var codes = [],
            code,
            quote = text.charCodeAt(offset);

        if (quote === 34/*"*/ || quote === 39/*'*/) {
            offset++;

            while (offset < limit) {
                code = text.charCodeAt(offset);

                if (code === quote) {
                    offset++;
                    return {
                        type: 'String',
                        value: String.fromCharCode.apply(null, codes)
                    };
                }

                if (code === 92/*\*/) {
                    offset++;
                    if (readNl()) {
                        continue;
                    }
                    offset--;

                    readEscape(codes);
                    continue;
                }

                if (code === 10/*\n*/ || code === 12/*\f*/ || code === 13/*\r*/) {
                    break;
                }

                offset++;
                codes.push(code);
            }

            return {
                type: 'Invalid',
                value: String.fromCharCode.apply(null, codes)
            };
        }

        return null;
    }

    // num       [0-9]+|[0-9]*\.[0-9]+
    function readNumberToken() {
        var startOffset = offset;

        readDecimalDigits();

        if (text.charCodeAt(offset) === 46/*.*/) {
            offset++;
            if (!readDecimalDigits()) {
                offset--;
            }
        }

        if (startOffset < offset) {
            return {
                type: 'Number',
                value: parseFloat(text.slice(startOffset, offset))
            };
        }

        return null;
    }

    // [ \t\r\n\f]+     return S;
    function readWhiteSpaceToken() {
        var startOffset = offset,
            code;

        while (offset < limit) {
            code = text.charCodeAt(offset);
            if (code === 32/* */ || code === 9/*\t*/ || code === 10/*\n*/ ||
                code === 12/*\f*/ || code === 13/*\r*/) {
                offset++;
            } else {
                break;
            }
        }

        if (startOffset < offset) {
            return {
                type: 'WhiteSpace',
                value: text.slice(startOffset, offset)
            };
        }

        return null;
    }

    function readPunctuatorToken() {
        var startOffset = offset;

        switch (text.charCodeAt(offset)) {
            case 33:  // !
            case 35:  // #
            case 40:  // (
            case 41:  // )
            case 43:  // +
            case 44:  // ,
            case 45:  // -
            case 46:  // .
            case 47:  // /
            case 58:  // :
            case 61:  // =
            case 62:  // >
            case 91:  // [
            case 93:  // ]
                offset++;
                break;

            case 36:  // $
            case 94:  // ^
                if (text.charCodeAt(offset + 1) === 61/*=*/) {
                    offset += 2;
                }
                break;

            case 42:  // *
            case 124: // |
            case 126: // ~
                offset++;
                if (text.charCodeAt(offset) === 61/*=*/) {
                    offset++;
                }
                break;
        }

        if (startOffset < offset) {
            return {
                type: 'Punctuator',
                value: text.slice(startOffset, offset)
            };
        }

        return null;
    }

    function tokenize() {
        var code = text.charCodeAt(offset),
            token;

        if (code === 34/*"*/ || code === 39/*'*/) {
            return readStringToken();
        }

        if (code === 46/*.*/) {
            code = text.charCodeAt(offset + 1);
            if (code >= 48 && code <= 57) { // [0-9]
                return readNumberToken();
            }
            return readPunctuatorToken();
        }

        if (code >= 48 && code <= 57) { // [0-9]
            return readNumberToken();
        }

        token = readIdentifierToken() ||
                readWhiteSpaceToken() ||
                readPunctuatorToken();

        if (!token) {
            throw new Error('Illegal character "' + text.charAt(offset) + '" at ' + offset);
        }

        return token;
    }

    function lex(sourceText) {
        var tokens = [];
        text = sourceText || '';
        offset = 0;
        limit = text.length;

        while (offset < limit) {
            tokens.push(tokenize());
        }
        tokens.push({ type: 'EOF' });

        return tokens;
    }

    return lex;
})();
