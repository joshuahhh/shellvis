#!/bin/bash

# What does this script do?

cat launchd.log |
  egrep 'Sandbox restriction$' |
  sed -n 's/.*requestor = \(.*\)\[.*/\1/p' |
  sort |
  uniq -c
