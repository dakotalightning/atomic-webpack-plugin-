const path = require("path");
const fs = require("fs");

const { validate } = require("schema-utils");

const defaultOptions = {
  base: "./src/components",
  output: "index.ts",
  header:
    "// @generated\n// This file is automatically generated and should not be edited.\n\n",
  regularExpression: /\.?\/.+\/index\.tsx$/,
};

/** @typedef {import("schema-utils/declarations/validate").Schema} Schema */
/** @typedef {import("webpack").Compiler} Compiler */
/** @typedef {import("webpack").Compilation} Compilation */
/** @typedef {import("webpack").WebpackError} WebpackError */
/** @typedef {import("webpack").Asset} Asset */
/** @typedef {ReturnType<Compilation["getLogger"]>} WebpackLogger */
/** @typedef {ReturnType<Compilation["getCache"]>} CacheFacade */
/** @typedef {ReturnType<ReturnType<Compilation["getCache"]>["getLazyHashedEtag"]>} Etag */
/** @typedef {ReturnType<Compilation["fileSystemInfo"]["mergeSnapshots"]>} Snapshot */

/**
 * @typedef {boolean} Force
 */

/**
 * @typedef {string} Context
 */

/**
 * @typedef {Record<string, boolean>} Files
 */

/**
 * @typedef { (changes: boolean, keys: string[], instance: Atomic) => void } AtomicCheckCallback
 */

/**
 * @typedef { (keys: string[], instance: Atomic) => void } AtomicRunCallback
 */

/**
 * @typedef {Object} CleanKeys
 * @property {string} key
 * @property {string} componentName
 * @property {string} from
 */

/**
 * @typedef {Object} AtomicOptions
 * @property {string} base
 * @property {string} output
 * @property {string} header
 * @property {RegExp} regularExpression
 * @property {WebpackLogger} logger
 * @property {Context} context
 */

/**
 * @param {string[]} a
 * @param {string[]} b
 * @returns {boolean}
 */
const equalsIgnoreOrder = (a, b) => {
  if (a.length !== b.length) return false;
  const uniqueValues = new Set([...a, ...b]);
  for (const v of uniqueValues) {
    const aCount = a.filter(e => e === v).length;
    const bCount = b.filter(e => e === v).length;
    if (aCount !== bCount) return false;
  }
  return true;
}

class Atomic {
  /**
   * @param {Partial<AtomicOptions>} options
   */
  constructor(options) {
    /**
     * @private
     * @type {string []}
     */
    this.keys = [];

    /**
     * @private
     * @type {Files}
     */
    this.files = {};

    /**
     * @private
     * @type {string}
     */
    this.context = __dirname;

    /**
     * @private
     * @type {RegExp}
     */
    this.regularExpression = defaultOptions.regularExpression;

    /**
     * @private
     * @type {string}
     */
    this.base = defaultOptions.base;

    /**
     * @private
     * @type {string}
     */
    this.header = defaultOptions.header;

    /**
     * @private
     * @type {string}
     */
    this.output = defaultOptions.output;

    /**
     * @private
     * @type {Partial<AtomicOptions>}
     */
    this.settings = defaultOptions;

    this.setOptions(options);

    this.scanSubDirectories = true;

    this.logger = {
      // eslint-disable-next-line no-console
      info: console.log,
      // eslint-disable-next-line no-console
      error: console.error,
      // eslint-disable-next-line no-console
      trace: console.error,
      // eslint-disable-next-line no-console
      debug: console.debug,
    };
  }

  /**
   * @param {Partial<AtomicOptions>} options
   */
  setOptions(options) {
    const settings = Object.assign({}, this.settings, options);
    // @ts-ignore
    this.context = settings.context;
    // @ts-ignore
    this.logger = settings.logger;
    // @ts-ignore
    this.base = settings.base;
    // @ts-ignore
    this.output = settings.output;
    // @ts-ignore
    this.header = settings.header;
    // @ts-ignore
    this.regularExpression = settings.regularExpression;

    this.settings = settings;
  }

  /**
   * @private
   * @param {string} directory
   * @param {boolean} scanSubDirectories
   * @param {RegExp} regularExpression
   * @returns {string[]}
   */
  getComponents(directory, scanSubDirectories, regularExpression) {
    this.logger.info("Get Components...", directory);
    this.files = {};
    this.readDirectory(directory, scanSubDirectories, regularExpression);
    this.keys = Object.keys(this.files);
    return this.keys;
  }

  /**
   * @private
   * @param {string} directory
   * @param {boolean} scanSubDirectories
   * @param {RegExp} regularExpression
   * @returns {void}
   */
  readDirectory(directory, scanSubDirectories, regularExpression) {
    fs.readdirSync(directory).forEach((file) => {
      const fullPath = path.resolve(directory, file);

      if (fs.statSync(fullPath).isDirectory()) {
        if (scanSubDirectories)
          this.readDirectory(fullPath, scanSubDirectories, regularExpression);

        return;
      }

      if (!regularExpression.test(fullPath)) return;

      this.files[fullPath] = true;
    });
  }

  /**
   * @public
   * @param {string[]} keys
   * @returns {CleanKeys[]}
   */
  static cleanKeys(keys) {
    return keys.map((key) => {
      return {
        key,
        componentName: key.replace(/^.+\.?\/([^/]+)\/index\.tsx/, "$1"),
        from: key.replace(/^.+\.?\/([^/]+\/[^/]+)\/index\.tsx/, "./$1"),
      };
    });
  }

  /**
   * @public
   * @param {AtomicCheckCallback} callback
   * @returns {void}
   */
  check(callback) {
    this.logger.info("Running Check");
    const keys = Atomic.cleanKeys(this.keys);
    let changes = false;
    this.logger.info("...Checking keys");
    keys.forEach(k => {
      try {
        fs.accessSync(k.key, fs.constants.F_OK);
        this.logger.debug("\u2713", k.from);
      } catch (err) {
        changes = true;
        this.logger.info("Detected component change", k.from);
      }
    });

    if (!changes) {
      const resolvedBase = path.resolve(this.context, this.base);
      this.logger.info("...Checking files");

      this.files = {};
      this.readDirectory(resolvedBase, this.scanSubDirectories, this.regularExpression);
      const fileKeys = Object.keys(this.files);

      const equal = equalsIgnoreOrder(fileKeys, this.keys);
      if (!equal) {
        changes = true
      }
    }

    if (changes) {
      this.logger.info("Changes detected...");
    } else {
      this.logger.info("No changes...");
    }
    callback.call(this, changes, this.keys, this);
  }

  /**
   * @public
   * @param {AtomicRunCallback} callback
   * @returns {Partial<{ keys: string[], instance: Atomic }>}
   */
  run(callback) {
    this.logger.info("Run...");

    const resolvedBase = path.resolve(this.context, this.base);
    const resolvedOutput = path.resolve(this.context, this.base, this.output);

    try {
      fs.accessSync(resolvedBase, fs.constants.F_OK);
    } catch (err) {
      this.logger.error(
        `Unable to find ${resolvedBase} check your settings base`
      );
      this.logger.trace(err);
      return {};
    }

    try {
      fs.accessSync(resolvedOutput, fs.constants.F_OK);
    } catch (err) {
      this.logger.error(
        `Unable to find ${resolvedOutput} check your [output] and [base] options`
      );
      this.logger.trace(err);
      return {};
    }

    const keys = this.getComponents(
      resolvedBase,
      this.scanSubDirectories,
      this.regularExpression
    );
    const cleanKeys = Atomic.cleanKeys(keys);

    const contentArray = cleanKeys.map(
      (k) => `export { default as ${k.componentName} } from '${k.from}'\n`
    );
    const content = `${this.header}${contentArray.join("")}`;

    try {
      fs.writeFileSync(resolvedOutput, content);
      this.logger.info(
        `Generated @atomic! ${keys.length} files add to ${resolvedOutput}`
      );
    } catch (err) {
      this.logger.error("Error writing 'index.ts'", err);
      this.logger.trace(err);
      return {};
    }

    callback.call(this, this.keys, this);
    // eslint-disable-next-line consistent-return
    return {
      keys: this.keys,
      instance: this,
    };
  }
}

const schema = {
  type: "object",
  properties: {
    test: {
      base: "string",
      output: "string",
      header: "string",
      regularExpression: "RegExp",
    },
  },
};

class AtomicWebpackPlugin {
  /**
   * @param {AtomicOptions} [options]
   */
  constructor(options) {
    validate(
      /** @type {Schema} */ (schema),
      /** @ts-ignore */
      options,
      {
        name: "AtomicWebpackPlugin",
        baseDataPath: "options",
      }
    );

    this.atomic = new Atomic(Object.assign({}, defaultOptions, options || {}));
  }

  /**
   * @param {Compiler} compiler
   */
  apply(compiler) {
    const PLUGIN_NAME = AtomicWebpackPlugin.name;
    const logger = compiler.getInfrastructureLogger("atomic");

    compiler.hooks.environment.tap(PLUGIN_NAME, () => {
      this.atomic.setOptions({
        logger,
        context: compiler.context,
      });

      // create the first set
      logger.info("Atomic start");
      this.atomic.run(() => {
        logger.info("Done");
      });
    });

    compiler.hooks.run.tapAsync(PLUGIN_NAME, (_, callback) => {
      this.atomic.check((changes) => {
        if (changes) {
          this.atomic.run(() => {
            logger.info("Done");
          });
        }
        callback();
      });
    });

    compiler.hooks.watchRun.tapAsync(PLUGIN_NAME, (_, callback) => {
      this.atomic.check((changes) => {
        if (changes) {
          this.atomic.run(() => {
            logger.info("Done");
          });
        }
        callback();
      });
    });
  }
}

module.exports = AtomicWebpackPlugin;
