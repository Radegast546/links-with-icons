const text = '[text](file:///C:/Users/musil/Desktop/Shari Lapena - Jeden z nas (2020)(CZ)/30 - Jeden z nás.mp3) and [b](c:\\path) and [c](foo(bar)baz) and [d](simple)';
const r5 = /\[([^\]]+)\]\(((?:[^()]|\([^()]*\))*)\)/g;
let match;
while ((match = r5.exec(text)) !== null) {
    console.log("R5 MATCH:", match[1], "| URL:", match[2]);
}
