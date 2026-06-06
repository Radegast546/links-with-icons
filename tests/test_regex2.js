const regex2 = /\[[^\]]*\]\(([^)]*?(?:\([^)]*\)[^)]*)*?)\)/g;
const text = '[My Folder](file:///C:/Users/musil/Documents) and [My File](C:\\Users\\musil\\file.txt) and [Web](https://google.com)';

let match;
while ((match = regex2.exec(text)) !== null) {
    console.log("MATCH:", match[1]);
}
