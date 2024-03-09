#!/usr/bin/env python3

import shutil
import sys
import os
import tempfile
import time
import subprocess
import argparse

# --------------------
# GENERAL SYSTEM STUFF
# --------------------

def get_upper_dir(system_dir):
  return os.path.join(system_dir, 'upper')

def get_union_dir(system_dir):
  return os.path.join(system_dir, 'union')

def make_system(system_dir, root_dir):
  # we assume system_dir already exists

  upper_dir = get_upper_dir(system_dir)
  union_dir = get_union_dir(system_dir)

  os.mkdir(upper_dir)
  os.mkdir(union_dir)

  # TODO: make sure unionfs is installed
  subprocess.run(
    [
      'unionfs',
      '-o',
      'cow',
      f'{upper_dir}=rw:{root_dir}=ro',
      union_dir,
    ],
    check=True,
  )

def remove_system(system_dir):
  union_dir = get_union_dir(system_dir)

  while True:
    if not os.path.ismount(union_dir):
      break
    try:
      # TODO: force unmount seems necessary to, say, get around daemons. is it ok?
      subprocess.run(['diskutil', 'unmount', 'force', union_dir], check=True, stdout=subprocess.DEVNULL)
      break
    except:
      time.sleep(0.5)
  shutil.rmtree(system_dir, ignore_errors=True)

# -------------
# FUN-RUN STUFF
# -------------

def main_make(args):
  sandbox_dir = args.SANDBOX_DIR
  root_dir = args.ROOT_DIR
  make_system(sandbox_dir, root_dir)

def main_before_run(args):
  delta_dir = args.DELTA_DIR

  # TODO: We could do this cleanup after main_after_run, obviating the need for main_before_run entirely.
  #       For now, I'm leaving this here, for flexibility's sake.
  upper_dir = get_upper_dir(delta_dir)
  shutil.rmtree(upper_dir)
  os.mkdir(upper_dir)

def main_after_run(args):
  delta_dir = args.DELTA_DIR
  sandbox_dir = args.SANDBOX_DIR
  log_file = args.LOG_FILE

  # stage 1: walk delta's upper dir for changed files

  upper_dir = get_upper_dir(delta_dir)

  deleted_dirs = []
  deleted_files = []
  present_dirs = []
  present_files = []
  for parent, dirs, files in os.walk(upper_dir):
    parent_in_upper = parent[len(upper_dir) + 1:]  # path of `parent` relative to `upper`, without leading or trailing slash
    if parent_in_upper.startswith('.unionfs'):
      # we are in unionfs metadata folder, containing deletions
      parent_in_uppermeta = parent_in_upper[len('.unionfs/'):]  # path of `parent` relative to `upper/.unionfs`, without leading or trailing slash
      for file in files:
        if file.endswith('_HIDDEN~'):
          deleted_files.append(os.path.join(parent_in_uppermeta, file[:-len('_HIDDEN~')]))
      deleted_dirs_here = []
      for dir in dirs:
        if dir.endswith('_HIDDEN~'):
          deleted_dir_here = dir[:-len('_HIDDEN~')]
          deleted_dirs_here.append(deleted_dir_here)
          deleted_dirs.append(os.path.join(parent_in_uppermeta, deleted_dir_here))
      if deleted_dirs_here:
        dirs[:] = [dir for dir in dirs if dir not in deleted_dirs_here]
    else:
      # we are in unionfs non-metadata folder, containing creations & modifications
      if parent_in_upper != '':
        present_dirs.append(parent_in_upper)
      for file in files:
        present_files.append(os.path.join(parent_in_upper, file))

  # TODO: looks like unionfs can have a _HIDDEN~ marker parallel to a modified marker; weird?
  deleted_dirs = [dir for dir in deleted_dirs if dir not in present_dirs]
  deleted_files = [file for file in deleted_files if file not in present_files]

  # print('present:', present_dirs, present_files)
  # print('deleted:', deleted_dirs, deleted_files)

  # TODO: this is commented out cuz for this use-case we want to write an empty file when there are no changes
  # if not (deleted_dirs or deleted_files or present_dirs or present_files):
  #   return

  # stage 2: turn changed files into commands to apply

  sandbox_union_dir = get_union_dir(sandbox_dir)

  commands = []
  def body(f):
    for file in deleted_dirs:
      commands.append(['rm', '-rf', os.path.join(sandbox_union_dir, file)])
      print(file, '(deleted)', file=f)
    for file in deleted_files:
      commands.append(['rm', os.path.join(sandbox_union_dir, file)])
      print(file, '(deleted)', file=f)
    for file in present_dirs:
      if not os.path.isdir(os.path.join(sandbox_union_dir, file)):
        commands.append(['mkdir', '-p', os.path.join(sandbox_union_dir, file)])
        print(file, '(new dir)', file=f)
    for file in present_files:
      if os.path.isfile(os.path.join(sandbox_union_dir, file)):
        commands.append(['cp', '-fa', os.path.join(upper_dir, file), os.path.join(sandbox_union_dir, file)])
        print(file, '(modified)', file=f)
      elif os.path.isdir(os.path.join(sandbox_union_dir, file)):
        commands.append(['rm', '-rf', os.path.join(sandbox_union_dir, file)])
        commands.append(['cp', '-fa', os.path.join(upper_dir, file), os.path.join(sandbox_union_dir, file)])
        print(file, '(dir replaced with file)', file=f)
      else:
        commands.append(['cp', '-fa', os.path.join(upper_dir, file), os.path.join(sandbox_union_dir, file)])
        print(file, '(new file)', file=f)

  if log_file == '-':
    body(sys.stdout)
  else:
    with open(log_file, 'w') as f:
      body(f)

  # print()
  # for command in commands:
  #   print(' '.join(command))
  # return

  # stage 3: apply commands

  for command in commands:
    subprocess.run(command, check=True)

def main_remove(args):
  sandbox_dir = args.SANDBOX_DIR
  remove_system(sandbox_dir)

def main():
  parser = argparse.ArgumentParser()
  subparsers = parser.add_subparsers(required=True)

  parser_make = subparsers.add_parser('make')
  parser_make.add_argument('SANDBOX_DIR')
  parser_make.add_argument('ROOT_DIR')
  parser_make.set_defaults(func=main_make)

  parser_before_run = subparsers.add_parser('before-run')
  parser_before_run.add_argument('DELTA_DIR')
  parser_before_run.set_defaults(func=main_before_run)

  parser_after_run = subparsers.add_parser('after-run')
  parser_after_run.add_argument('DELTA_DIR')
  parser_after_run.add_argument('SANDBOX_DIR')
  parser_after_run.add_argument('LOG_FILE')
  parser_after_run.set_defaults(func=main_after_run)

  parser_remove = subparsers.add_parser('remove')
  parser_remove.add_argument('SANDBOX_DIR')
  parser_remove.set_defaults(func=main_remove)

  args = parser.parse_args()
  args.func(args)

if __name__ == '__main__':
  main()
