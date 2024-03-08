zmodload zsh/net/tcp

function go () {
  ztcp google.com 80
  echo $REPLY
}

go

go
