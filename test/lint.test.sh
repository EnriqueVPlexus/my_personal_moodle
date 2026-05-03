#!/usr/bin/env bash
set -e

echo "Running linter..."
npm run lint

echo "Checking AWS roadmap seed..."
node test/aws-roadmap-seed.test.mjs

echo "Lint finished. Add real tests in test/ as needed."
