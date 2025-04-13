export function find_line_with_string(text: string, target: string) {
    // 按行分割文本
    const lines = text.split('\n');
    // 查找包含目标字符串的行
    for (const line of lines) {
        if (new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(line)) {
            return line;
        }
    }
    return ""; // 未找到返回 null
}