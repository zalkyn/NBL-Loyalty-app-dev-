// import { defineConfig } from 'rollup';
// import { nodeResolve } from '@rollup/plugin-node-resolve';
// import terser from '@rollup/plugin-terser';

// export default defineConfig({
//     input: 'public/widget/modules-main/scripts/main.js',
//     output: {
//         file: 'extensions/theme-extension/assets/ui.min.js',
//         // file: 'public/widget/main.min.js',
//         format: 'iife',
//         name: 'NBLWidget',
//     },
//     plugins: [
//         nodeResolve(),
//         terser({
//             compress: { passes: 2 },
//             mangle: true,
//             ecma: 2018,
//             safari10: true,
//         }),
//     ],
// });

import { defineConfig } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import esbuild from 'rollup-plugin-esbuild';

export default defineConfig({
    input: 'public/widget/module-preact/main.preact.jsx',
    output: {
        file: 'extensions/theme-extension/assets/ui.min.js',
        format: 'iife',
        name: 'NBLWidget',
    },
    plugins: [
        nodeResolve({ extensions: ['.js', '.jsx'] }),
        esbuild({
            tsconfig: false,        // project root-er tsconfig.json (React admin app-er "react-jsx") ke ignore kora
            jsx: 'transform',
            jsxFactory: 'h',         // <div> -> h('div', ...) -- Preact-er function
            jsxFragment: 'Fragment', // <>...</> -> Fragment
        }),
        terser({
            compress: { passes: 2 },
            mangle: true,
            ecma: 2018,
            safari10: true,
        }),
    ],
});