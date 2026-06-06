const text = '[a](foo) and [song](file:///C:/Users/musil/Desktop/Shari Lapena - Jeden z nas (2020)(CZ)/24 - Jeden z nás.mp3) and [b](bar)';
const regex4 = /\[([^\]]+)\]\((.+?\.([a-zA-Z0-9]+))\)/g;
let match;
while ((match = regex4.exec(text)) !== null) {
    console.log("MATCH:", match[0], "| EXT:", match[3]);
}

const regex5 = /\[([^\]]+)\]\(([^)]*?(?:\([^)]*\)[^)]*)*?\.([a-zA-Z0-9]+))\)/g;
while ((match = regex5.exec(text)) !== null) {
    console.log("MATCH 5:", match[0], "| EXT:", match[3]);
}
