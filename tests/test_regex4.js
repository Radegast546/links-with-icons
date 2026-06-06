const text = '[text](file:///C:/Users/musil/Desktop/Shari Lapena - Jeden z nas (2020)(CZ)/30 - Jeden z nás.mp3) and [b](c:\\path)';
const r3 = /\[([^\]]+)\]\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g;
let match;
while ((match = r3.exec(text)) !== null) {
    console.log("R3 MATCH:", match[1], "| URL:", match[2]);
}
