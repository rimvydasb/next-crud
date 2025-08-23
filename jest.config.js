module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: [
        '**/_tests_/**/*.+(ts|tsx|js)',
        '**/*.(test|spec).+(ts|tsx|js)'
    ],
    moduleNameMapper: {
        '^@datalayer(.*)$': '<rootDir>/src/datalayer$1',
        '^@servicelayer(.*)$': '<rootDir>/src/servicelayer$1',
        '^@integrationlayer(.*)$': '<rootDir>/src/integrationlayer$1'
    }
}
