#!/sbin/node

import { promises as fsPromises, existsSync } from 'fs';
import path from 'path';

import { Command } from 'commander';
import { isRegExp } from 'util/types';
const program = new Command();

program
  .description('Rename files using js regular expressions')
  .version('1.0.0')
  .argument('<regex>', 'Regular expression to search for.', (s) => {
    let flags = ''
    if (program.opts().replaceAll) flags += 'g'
    if (program.opts().ignoreCase) flags += 'i'
    return new RegExp(s, flags);
  })
  .argument(
    '<replacement>',
    'Matches will be replaced by this string. $N represents the Nth capturing group.'
  )
  .argument('[directory]', 'Rename files in this directory.', './')
  .option('-f, --force', 'Overwrite files if name already exists')
  .option('-p, --dry-run', "Don't rename files")
  .option('-a, --replace-all', 'Replace all ocurrances.')
  .option('-i, --ignore-case', 'Regex ignores case.')
  .option('-q, --quiet', 'Supress messages.')
  .action(async (regex, replacement, dir, opts) => {
    const replaceFunction = opts.replaceAll
      ? (string, regex, replace) => string.replaceAll(regex, replace)
      : (string, regex, replace) => string.replace(regex, replace);
    const print = opts.quiet ? () => {} : (...args) => console.log(...args);
    try {
      const files = new Set(await fsPromises.readdir(dir));
      const newFiles = new Set();
      let noMatches = true;
      for (const file of files) {
        const newName = replaceFunction(file, regex, replacement);
        if (newName !== file) {
          noMatches = false;
          const newPath = path.join(dir, newName);
          const oldPath = path.join(dir, file);
          const exists = files.has(newName);
          const repeatedRename = newFiles.has(newName);
          if (!repeatedRename && (opts.force || !exists)) {
            newFiles.add(newName);
            if (!opts.dryRun) {
              fsPromises
                .rename(oldPath, newPath)
                .then(() => {
                  print(oldPath + ' --> ' + newPath);
                })
                .catch((err) => {
                  print(err.message);
                });
            } else {
              print(oldPath + ' --> ' + newPath);
            }
          } else if (repeatedRename) {
            print(
              `Aborting rename of '${oldPath}': antoher file has already been ranamed to '${newPath}'.`
            );
          } else {
            print(
              `Could not rename '${oldPath}' to '${newPath}' because a file already exists with that name.`
            );
          }
        }
      }
      if (noMatches) {
        print('No matches for ', regex);
      }
    } catch (err) {
      console.error(err);
    }
  })
  .parseAsync();
