#!/bin/bash

comm -12 words6.txt <(rev words6.txt | sort) | wc -l
