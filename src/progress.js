module.exports = class ProgressBar {
    constructor() {
        this.total;
        this.current;
        this.bar_length = 30;
        this.lastDraw;
        this.incomplete_char;
        this.text;
        this.complete_char;
    }

    init(total, text, complete_char, incomplete_char) {
        this.text = text;
        this.incomplete_char = incomplete_char ? incomplete_char : '_';
        this.complete_char = complete_char ? complete_char : '█'
        this.total = total;
        this.current = 0;
        this.update(this.current);
    }

    update(current) {
        this.current = current;
        const current_progress = this.current / this.total;
        this.draw(current_progress);
    }

    draw(current_progress) {
        const filled_bar_length = (current_progress * this.bar_length).toFixed(
            0
        );
        const empty_bar_length = this.bar_length - filled_bar_length;

        const filled_bar = this.get_bar(filled_bar_length, this.complete_char);
        const empty_bar = this.get_bar(empty_bar_length, this.incomplete_char);
        const percentage_progress = (current_progress * 100).toFixed(2);

        this.lastDraw = `${this.text} [${filled_bar}${empty_bar}] | ${(percentage_progress > 100) ? 100.00 : percentage_progress}%`
    };

    get_bar(length, char) {
        let str = "";
        for (let i = 0; i < length; i++) {
            str += char;
        }
        return str;
    }
};
