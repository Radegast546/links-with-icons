const text = '[text](file:///C:/Users/musil/Desktop/Shari Lapena - Jeden z nas (2020)(CZ)/30 - Jeden z nás.mp3) and [b](c:\\path)';
const r1 = /\[([^\]]+)\]\(([^)]*?(?:\([^)]*\)[^)]*)*?)\)/g;
let match;
while ((match = r1.exec(text)) !== null) {
    console.log("R1 MATCH:", match[1], "| URL:", match[2]);
}

const r2 = /\[([^\]]+)\]\((.+?)\)/g;
while ((match = r2.exec(text)) !== null) {
    console.log("R2 MATCH:", match[1], "| URL:", match[2]);
}
