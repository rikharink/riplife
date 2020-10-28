import { terser } from 'rollup-plugin-terser';
import typescript from '@rollup/plugin-typescript';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import replace from '@rollup/plugin-replace';
import fs from 'fs';
import path from 'path';

function readFile(path) {
    return JSON.stringify(fs.readFileSync(path, 'utf-8'));
}

const baseStyle = readFile(path.join('data', 'css', 'styles.css'));
const baseScript = readFile(path.join('data', 'js', 'index.js'));
const baseTemplate = readFile(path.join('data', 'baseof.liquid'));
const indexTemplate = readFile(path.join('data', 'index.liquid'));
const teamTemplate = readFile(path.join('data', 'team.liquid'));
const personTemplate = readFile(path.join('data', 'person.liquid'));

export default {
    input: 'index.ts',
    output: {
        file: 'bin/riplife.js',
        format: 'cjs',
        strict: false,
        banner: '#! /usr/bin/env node\n',
    },
    plugins: [
        replace({
            BASE_STYLE: baseStyle,
            BASE_SCRIPT: baseScript,
            BASE_TEMPLATE: baseTemplate,
            INDEX_TEMPLATE: indexTemplate,
            TEAM_TEMPLATE: teamTemplate,
            PERSON_TEMPLATE: personTemplate,
        }),
        typescript(),
        resolve(),
        commonjs({ include: 'node_modules/**' }),
        terser({
            compress: {
                passes: 4,
            },
            ecma: 8,
        }),
    ],
    external: ['child_process', 'fs', 'path', 'os', 'https', 'readline', 'zlib', 'events', 'stream', 'util', 'buffer'],
};
