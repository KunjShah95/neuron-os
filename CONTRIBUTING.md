# Contributing to Neuron OS

Thank you for considering contributing to Neuron OS! We welcome contributions of all kinds – code, documentation, bug reports, feature ideas, and more.

## How to Contribute

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/<your-username>/neuron-os.git
   cd neuron-os
   ```
3. **Install dependencies** (requires [Bun](https://bun.sh) >= 1.3.14):
   ```bash
   bun install
   ```
4. **Create a branch** for your work:
   ```bash
   git checkout -b feature/your-feature-name
   ```
5. **Make your changes** and ensure they follow our coding style (see [Code Style](#code-style)).
6. **Run the test suite** to verify nothing is broken:
   ```bash
   bun run test
   ```
7. **Commit your changes** with a clear, descriptive message.
8. **Push** to your fork and open a Pull Request (PR) against the `main` branch.

## Code Style

- We use **TypeScript** with strict mode.
- Formatting is enforced via **Prettier** and **ESLint**.
- Run `bun run lint` to check for linting errors.
- Run `bun run format` to auto-format code.

## Reporting Issues

If you find a bug or have a feature request, please open an issue on the [issue tracker](https://github.com/KunjShah95/neuron-os/issues). Provide as much detail as possible:

- Steps to reproduce (for bugs).
- Expected vs. actual behavior.
- Relevant code snippets or logs.
- Your environment (OS, Bun version, etc.).

## Good First Issues

Look for issues labeled [`good first issue`](https://github.com/KunjShah95/neuron-os/labels/good%20first%20issue). These are ideal for newcomers.

## Code of Conduct

Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for details.

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).

Thank you again for helping improve Neuron OS!