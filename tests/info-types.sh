# stdout
echo "hi"

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
# delete
rm hi
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
