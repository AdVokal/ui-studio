import { Config } from '@remotion/cli/config';
import path from 'path';

// Prefer ANGLE (hardware/WebGL2) by default; allow override via REMOTION_GL
const glBackend = (process.env.REMOTION_GL as 'angle' | 'egl' | 'swangle' | undefined) ?? 'angle';
Config.setChromiumOpenGlRenderer(glBackend);

Config.overrideWebpackConfig((config) => {
  const existingRules = (config.module?.rules ?? []).filter((rule) => {
    if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) return true;
    if (rule.test instanceof RegExp) {
      const src = rule.test.source;
      if (src.includes('scss') || src.includes('sass') || src.includes('css')) return false;
    }
    return true;
  });

  return {
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        '@': path.join(process.cwd(), 'src'),
      },
    },
    module: {
      ...config.module,
      rules: [
        {
          test: /\.module\.(scss|sass)$/,
          use: [
            {
              loader: 'style-loader',
              options: { esModule: false, injectType: 'styleTag' },
            },
            {
              loader: 'css-loader',
              options: {
                esModule: false,
                modules: {
                  namedExport: false,
                  exportLocalsConvention: 'camelCase',
                  localIdentName: '[local]_[hash:base64:5]',
                },
              },
            },
            'sass-loader',
          ],
        },
        {
          test: /\.(scss|sass)$/,
          exclude: /\.module\.(scss|sass)$/,
          use: [
            { loader: 'style-loader', options: { esModule: false } },
            { loader: 'css-loader', options: { esModule: false } },
            'sass-loader',
          ],
        },
        {
          test: /\.module\.css$/,
          use: [
            { loader: 'style-loader', options: { esModule: false } },
            {
              loader: 'css-loader',
              options: {
                esModule: false,
                modules: {
                  namedExport: false,
                  exportLocalsConvention: 'camelCase',
                  localIdentName: '[local]_[hash:base64:5]',
                },
              },
            },
          ],
        },
        {
          test: /\.css$/,
          exclude: /\.module\.css$/,
          use: [
            { loader: 'style-loader', options: { esModule: false } },
            { loader: 'css-loader', options: { esModule: false } },
          ],
        },
        {
          test: /\.glsl$/,
          type: 'asset/source',
        },
        ...existingRules,
      ],
    },
  };
});
