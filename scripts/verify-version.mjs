import fs from 'fs';
import process from 'process';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const versions = JSON.parse(fs.readFileSync('versions.json', 'utf8'));
const expectedVersion = process.env.RELEASE_TAG ?? manifest.version;

const actualVersions = {
    'package.json': packageJson.version,
    'package-lock.json': packageLock.version,
    'package-lock root package': packageLock.packages?.['']?.version,
    'manifest.json': manifest.version,
};

for (const [source, version] of Object.entries(actualVersions)) {
    if (version !== expectedVersion) {
        throw new Error(`${source} has version ${version}; expected ${expectedVersion}.`);
    }
}

if (!(expectedVersion in versions)) {
    throw new Error(`versions.json has no entry for ${expectedVersion}.`);
}

console.log(`Version ${expectedVersion} is synchronized.`);
