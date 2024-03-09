function gen() {
  while true; do
    echo "hello"
    sleep 0.1
  done
}
# gen | rev | head -2
gen | head -2
