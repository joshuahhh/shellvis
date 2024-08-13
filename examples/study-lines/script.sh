#!/bin/bash

# There are some files in the `files` directory. Write a script that
# computes the product of their line counts. (Ex: If there were two
# files, one with 10 lines and one with 20, the product would be
# 200.)
#
# The starter code below counts lines, but doesn't do any
# multiplying.

product=1

for f in files/*; do
  wc -l < $f
done
