#!/bin/bash

# Example URL: https://dl.acm.org/doi/10.1145/3586182.3615827
pbcopy <<< "https://dl.acm.org/doi/10.1145/3586182.3615827"

url=$(pbpaste)
echo "URL: $url"

html=$(wget --quiet -O - "$url")
# echo "HTML: $html"

title=$(pup "title text{}" <<< "$html")
echo "Title: $title"

textutil -stdin -format html -convert rtf -stdout <<< "<a href=\"${url}\">&#x1F517; ${title}</a>" |
  SHELLVIS=1 pbcopy  # @shellvis-pause
