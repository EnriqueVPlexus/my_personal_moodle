#!/usr/bin/env bash
set -e

echo "Running linter..."
npm run lint

echo "Checking roadmap seeds..."
node test/aws-roadmap-seed.test.mjs

echo "Running unit tests with coverage..."
npm run test:coverage

echo "Quality checks finished."
