#!/sbin/node

import { promises as fsPromises } from 'fs';
import path from 'path';

import { Command, Option } from 'commander';
const program = new Command();

program
  .description('Rename files using js regular expressions')
  .version('1.0.0')
  .argument('<regex>', 'Regular expression to search for.', (s) => {
    let flags = '';
    if (program.opts().replaceAll) flags += 'g';
    if (program.opts().ignoreCase) flags += 'i';
    return new RegExp(s, flags);
  })
  .argument(
    '<replacement>',
    'Matches will be replaced by this string. $N represents the Nth capturing group and $& the whole match.'
  )
  .argument('[directory]', 'Rename files in this directory.', './')
  .option('-f, --force', 'Overwrite files if name already exists')
  .option(
    '-p, --dry-run',
    'Show what changes would be made without actually renaming files.'
  )
  .option(
    '-a, --replace-all',
    'Replace (or insert before/after) all ocurrances.'
  )
  .addOption(
    new Option(
      '-t, --insert-after',
      'Insert after match instead of replacing.'
    ).conflicts('insertBefore')
  )
  .addOption(
    new Option(
      '-b, --insert-before',
      'Insert before match instead of replacing.'
    ).conflicts('insertAfter')
  )
  .option('-i, --ignore-case', 'Regex ignores case.')
  .option('-q, --quiet', 'Supress messages.')
  .action(async (regex, replacement, dir, opts) => {
    let renameFunction;
    if (opts.insertAfter) {
      renameFunction = (string, regex, replace) =>
        insertAfter(string, regex, replace);
    } else if (opts.insertBefore) {
      renameFunction = (string, regex, replace) =>
        insertBefore(string, regex, replace);
    } else if (opts.replaceAll) {
      renameFunction = (string, regex, replace) =>
        string.replaceAll(regex, replace);
    } else {
      renameFunction = (string, regex, replace) =>
        string.replace(regex, replace);
    }
    const print = opts.quiet ? () => {} : (...args) => console.log(...args);
    try {
      const files = new Set(await fsPromises.readdir(dir));
      const newFiles = new Set();
      let noMatches = true;
      if (opts.dryRun) print('Dry run:\n');
      for (const file of files) {
        const newName = renameFunction(file, regex, replacement);
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

function insertBeforeOrAfter(src, regex, string, where) {
  const getMatches = regex.flags.includes('g')
    ? () => Array.from(src.matchAll(regex))
    : () => {
        const match = src.match(regex);
        return match ? [match] : [];
      };
  const matches = getMatches();
  if (matches.length == 0) return src;
  const slice =
    where === 'after'
      ? (src, i) =>
          src.slice(
            i == 0 ? 0 : matches[i - 1].index + matches[i - 1][0].length,
            matches[i].index + matches[i][0].length
          )
      : (src, i) =>
          src.slice(i == 0 ? 0 : matches[i - 1].index, matches[i].index);
  let s = '';
  for (let i = 0; i < matches.length; ++i) {
    const a = slice(src, i);
    const b = replaceCapturingGroups(string, matches[i]);
    s += a + b;
  }
  if (where === 'after') {
    s += src.slice(
      matches[matches.length - 1].index + matches[matches.length - 1][0].length
    );
  } else s += src.slice(matches[matches.length - 1].index);
  return s;
}
function insertAfter(src, regex, string) {
  return insertBeforeOrAfter(src, regex, string, 'after');
}
function insertBefore(src, regex, string) {
  return insertBeforeOrAfter(src, regex, string, 'before');
}

function replaceCapturingGroups(string, match) {
  return string.replaceAll(/(\$+)([1-9]|&)/g, (g0, g1, g2) => {
    if (g1.length % 2 == 0) return g0.replaceAll('$$', '$');
    g1 = g1.replaceAll('$$', '$').slice(0, -1);
    const idx = g2 === '&' ? 0 : parseInt(g2);
    return g1 + (match[idx] || '');
  });
}
