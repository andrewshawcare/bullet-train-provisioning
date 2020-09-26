#!/bin/bash -e
export $(cat .env | xargs)
./pipeline/publish.sh
./pipeline/deploy.sh