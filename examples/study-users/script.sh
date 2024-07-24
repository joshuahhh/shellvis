#!/bin/bash

cat users-to-delete.txt | while read LINE; do
  rm -rf $LINE.txt
done
