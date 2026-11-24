const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const HTMLPlugin = require('html-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const manifest = require('./manifest.json');

module.exports = {
  entry: {
    popup: path.join(__dirname, 'src', 'pages', 'Popup', 'index.jsx'),
    background: path.join(__dirname, 'src', 'Background', 'index.js'),
    content: path.join(__dirname, 'src', 'Content', 'index.js'),
    showVersion: path.join(__dirname, 'src', 'Content', 'show-version.js')
  },
  mode: 'production',
  devtool: 'source-map',
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, `Build-${manifest.version}`),
    clean: true,
    publicPath: '/'
  },
  module: {
    rules: [{
      test: /\.(js|jsx)$/,
      use: [{
        loader: 'source-map-loader'
      }, {
        loader: 'babel-loader'
      }],
      exclude: /node_modules/
    }, {
      test: /\.css$/i,
      use: [
        'style-loader',
        'css-loader'
      ]
    }]
  },
  plugins: [
    new Dotenv({
      path: './.env.production'
    }),
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' }
      ]
    }),
    new CopyPlugin({
      patterns: [{
        from: 'src/assets/images',
        to: 'images',
        force: true
      }]
    }),
    new HTMLPlugin({
      template: path.join(__dirname, 'src', 'pages', 'Popup', 'index.html'),
      filename: 'popup.html',
      chunks: ['popup'],
      cache: false
    })
  ],
  resolve: {
    extensions: ['.jsx', '.js', '.js']
  },
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          parse: {
            ecma: 8
          },
          compress: {
            ecma: 5,
            warnings: false,
            comparisons: false,
            inline: 2
          },
          mangle: {
            safari10: true
          },
          output: {
            ecma: 5,
            comments: false,
            ascii_only: true
          }
        }
      }),
      new CssMinimizerPlugin()
    ]
  }
};
