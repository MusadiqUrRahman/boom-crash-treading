module.exports = {
  transform: {},
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.js',
    'lib/**/*.js',
  ],
  coverageThreshold: {
    global: {
      statements: 33,
      branches: 32,
      functions: 33,
      lines: 35,
    },
  },
};
