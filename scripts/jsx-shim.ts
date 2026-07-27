/**
 * tsx resolves JSX using the nearest tsconfig, and our root config sets
 * "jsx": "react-jsx" only for files under src/. Rather than fight the
 * resolution order, expose React globally so both the automatic and classic
 * runtimes work in the test harness.
 */
import * as React from 'react';
(globalThis as Record<string, unknown>).React = React;
export {};
