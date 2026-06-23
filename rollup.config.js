import { defineConfig } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default defineConfig({
    input: 'public/widget/modules-main/scripts/main.js',
    output: {
        file: 'extensions/theme-extension/assets/ui.min.js',
        // file: 'public/widget/main.min.js',
        format: 'iife',
        name: 'NBLWidget',
    },
    plugins: [
        nodeResolve(),
        terser({
            compress: { passes: 2 },
            mangle: true,
            ecma: 2018,
            safari10: true,
        }),
    ],
});