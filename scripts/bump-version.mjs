import fs from 'fs';
import process from 'process';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error('Usage: npm run bump-version -- <semver>');
}

function readJson(filename) {
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function writeJson(filename, data) {
    fs.writeFileSync(filename, `${JSON.stringify(data, null, filename === 'manifest.json' ? '\t' : 2)}\n`);
}

const packageJson = readJson('package.json');
const packageLock = readJson('package-lock.json');
const manifest = readJson('manifest.json');
const versions = readJson('versions.json');

packageJson.version = version;
packageLock.version = version;
packageLock.packages[''].version = version;
manifest.version = version;
versions[version] = manifest.minAppVersion;

writeJson('package.json', packageJson);
writeJson('package-lock.json', packageLock);
writeJson('manifest.json', manifest);
writeJson('versions.json', versions);

console.log(`Updated project version to ${version}.`);
