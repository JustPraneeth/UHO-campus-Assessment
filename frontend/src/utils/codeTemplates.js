const templates = {
  c: `#include <stdio.h>

int main(void) {
    // Read input and write output here.
    return 0;
}
`,
  cpp: `#include <iostream>
using namespace std;

int main() {
    // Read input and write output here.
    return 0;
}
`,
  java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        // Read input and write output here.
        scanner.close();
    }
}
`,
  python: `import sys

def solve():
    data = sys.stdin.read().strip().split()
    # Read input and write output here.

if __name__ == "__main__":
    solve()
`,
  php: `<?php
$input = trim(stream_get_contents(STDIN));
// Read input and write output here.
`,
  javascript: `const fs = require("node:fs");
const input = fs.readFileSync(0, "utf8").trim();

// Read input and write output here.
`,
  csharp: `using System;

class Program
{
    static void Main()
    {
        string input = Console.In.ReadToEnd();
        // Read input and write output here.
    }
}
`,
  go: `package main

import (
    "fmt"
)

func main() {
    // Read input and write output here.
    _ = fmt.Println
}
`,
  rust: `use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read input");
    // Read input and write output here.
}
`,
};

export const supportedLanguages = [
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "java", label: "Java" },
  { value: "python", label: "Python" },
  { value: "php", label: "PHP" },
  { value: "javascript", label: "JavaScript" },
  { value: "csharp", label: "C#" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
];

export function getCodeTemplate(language) {
  return templates[language] || "";
}
