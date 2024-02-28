#!/bin/bash

for f in *.jpg; do
  mv $f $(uuidgen | cut -c1-8).jpg
done

tree
