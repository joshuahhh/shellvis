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
    try:
      # TODO: force unmount seems necessary to, say, get around daemons. is it ok?
      subprocess.run(['diskutil', 'unmount', 'force', union_dir], check=True, stdout=subprocess.DEVNULL)
      shutil.rmtree(system_dir)
      break
    except:
      time.sleep(0.5)

# -------------
# FUN-RUN STUFF
# -------------

def main_make(args):
  sandbox_dir = args.SANDBOX_DIR
  make_system(sandbox_dir, "/")

def main_run(args):
  sandbox_dir = args.SANDBOX_DIR
  sandbox_union_dir = get_union_dir(sandbox_dir)

  delta_dir = tempfile.mkdtemp()
  make_system(delta_dir, sandbox_union_dir)

  upper_dir = get_upper_dir(delta_dir)
  union_dir = get_union_dir(delta_dir)

  try:
    start_dir = os.path.join(union_dir, os.getcwd()[1:])
    command = args.CMD
    result = subprocess.run(command, cwd=start_dir, shell=True)

    if result.returncode != 0:
      # TODO: is this still the behavior we want for fun-run?
      sys.exit(result.returncode)

    # subprocess.run(['tree', '-a', upper_dir])

    deleted_dirs = []
    deleted_files = []
    present_dirs = []
    present_files = []
    for parent, dirs, files in os.walk(upper_dir):
      parent_in_upper = parent[len(upper_dir):]
      if parent_in_upper.startswith('/.unionfs'):
        # we are in unionfs metadata folder, containing deletions
        parent_in_upper = parent_in_upper[len('/.unionfs'):]
        for file in files:
          if file.endswith('_HIDDEN~'):
            deleted_files.append(os.path.join(parent_in_upper, file[:-len('_HIDDEN~')]))
        deleted_dirs_here = []
        for dir in dirs:
          if dir.endswith('_HIDDEN~'):
            deleted_dir_here = dir[:-len('_HIDDEN~')]
            deleted_dirs_here.append(deleted_dir_here)
            deleted_dirs.append(os.path.join(parent_in_upper, deleted_dir_here))
        if deleted_dirs_here:
          dirs[:] = [dir for dir in dirs if dir not in deleted_dirs_here]
      else:
        # we are in unionfs non-metadata folder, containing creations & modifications
        if parent_in_upper != '':
          present_dirs.append(parent_in_upper)
        for file in files:
          present_files.append(os.path.join(parent_in_upper, file))
    # print('present:', present_dirs, present_files)
    # print('deleted:', deleted_dirs, deleted_files)

    if not (deleted_dirs or deleted_files or present_dirs or present_files):
      return

    # TODO: looks like unionfs can have a _HIDDEN~ marker parallel to a modified marker; weird?
    deleted_dirs = [dir for dir in deleted_dirs if dir not in present_dirs]
    deleted_files = [file for file in deleted_files if file not in present_files]

    commands = []
    with open(args.LOG_FILE, 'w') as f:
      for file in deleted_dirs:
        commands.append(['rm', '-rf', os.path.join(sandbox_union_dir, file[1:])])
        print(file, '(deleted)', file=f)
      for file in deleted_files:
        commands.append(['rm', os.path.join(sandbox_union_dir, file[1:])])
        print(file, '(deleted)', file=f)
      for file in present_dirs:
        if not os.path.isdir(file):
          commands.append(['mkdir', '-p', os.path.join(sandbox_union_dir, file[1:])])
          print(file, '(new dir)', file=f)
      for file in present_files:
        if os.path.isfile(file):
          commands.append(['cp', '-fa', os.path.join(upper_dir, file[1:]), os.path.join(sandbox_union_dir, file[1:])])
          print(file, '(modified)', file=f)
        elif os.path.isdir(file):
          commands.append(['rm', '-rf', os.path.join(sandbox_union_dir, file[1:])])
          commands.append(['cp', '-fa', os.path.join(upper_dir, file[1:]), os.path.join(sandbox_union_dir, file[1:])])
          print(file, '(dir replaced with file)', file=f)
        else:
          commands.append(['cp', '-fa', os.path.join(upper_dir, file[1:]), os.path.join(sandbox_union_dir, file[1:])])
          print(file, '(new file)', file=f)

    # print()
    # for command in commands:
    #   print(' '.join(command))
    for command in commands:
      subprocess.run(command, check=True)
  finally:
    remove_system(delta_dir)

def main_remove(args):
  sandbox_dir = args.SANDBOX_DIR
  remove_system(sandbox_dir)

def main():
  parser = argparse.ArgumentParser()
  subparsers = parser.add_subparsers(required=True)

  parser_make = subparsers.add_parser('make')
  parser_make.add_argument('SANDBOX_DIR')
  parser_make.set_defaults(func=main_make)

  parser_run = subparsers.add_parser('run')
  parser_run.add_argument('SANDBOX_DIR')
  parser_run.add_argument('CMD')
  parser_run.add_argument('LOG_FILE')
  parser_run.set_defaults(func=main_run)

  parser_remove = subparsers.add_parser('remove')
  parser_remove.add_argument('SANDBOX_DIR')
  parser_remove.set_defaults(func=main_remove)

  args = parser.parse_args()
  args.func(args)

if __name__ == '__main__':
  main()
