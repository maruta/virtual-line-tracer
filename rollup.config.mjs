import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';
import polyfillNode from 'rollup-plugin-polyfill-node';

export default {
  input: 'src/main.js',
  output: {
    file: 'public/bundle.js',
    format: 'iife',
    sourcemap: true,
    name: 'bundle'
  },
  plugins: [
    resolve({
      browser: true, // ブラウザ環境用の設定
      preferBuiltins: false 
    }),
    commonjs({
      include: /node_modules/ // node_modulesを含む
    }),
    babel({
      babelHelpers: 'bundled'
    }),
    terser(),
    polyfillNode()
  ]
};
