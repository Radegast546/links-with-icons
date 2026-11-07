import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadValidatedSettings } from '../src/settings';

describe('settings recovery', () => {
    it.each([null, [], 'broken', 5])('recovers defaults from malformed data %j', (raw) => {
        expect(loadValidatedSettings(raw)).toEqual(DEFAULT_SETTINGS);
    });

    it('preserves valid preferences while rejecting incompatible values', () => {
        const settings = loadValidatedSettings({ enableWebFavicons: false, iconSize: 999,
            faviconProvider: 'unknown', ignoredDomains: null, blacklistedExtensions: ['pdf'] });
        expect(settings.enableWebFavicons).toBe(false);
        expect(settings.iconSize).toBe(64);
        expect(settings.faviconProvider).toBe('google');
        expect(settings.ignoredDomains).toBe('');
        expect(settings.blacklistedExtensions).toBe('');
    });
});
