module.exports = {
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/test/envVars.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
};
