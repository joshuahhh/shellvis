touch old-file.txt
touch modified-file.txt

change_files () {
  rm old-file.txt
  touch new-file-1.txt
  touch new-file-2.txt
  echo hi > modified-file.txt
}

big_output () {
  echo "first line"
  echo "second line"
  echo "third line"
  echo "fourth line"
}


change_files
big_output




