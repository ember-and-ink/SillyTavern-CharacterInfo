import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Only the pure logic (card.js) is unit-tested; it has no DOM or
        // SillyTavern dependencies, so a plain Node environment is enough.
        environment: 'node',
        include: ['test/**/*.test.js'],
    },
});
