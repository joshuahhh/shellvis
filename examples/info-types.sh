# stdout
echo "hi"

# stdout: many lines
echo "hi\nhello\nhow are you?"

# stderr
function bad() {
  echo "bad" >&2
}
bad

# effect
say "hi"

# exit code
false

# change dir
cd ..

# file events...
# new file
touch hi
# modified
function append() {
  echo "hi" >> hi
}
append
# multiple
mv hi hi2
# delete
rm hi2
# new folder
mkdir hi
# remove folder
rmdir hi

# var events...
# add
GREETING=hi
# change
GREETING=hello
# remove
unset GREETING
# change attrib
function decl() {
  typeset -a SOME_ARRAY
}
decl
