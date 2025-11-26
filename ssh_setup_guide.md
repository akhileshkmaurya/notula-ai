# Setting up Local SSH Access to Google Cloud VM

To run the `deploy.sh` script from your local machine, you need to configure SSH access.

## Step 1: Generate an SSH Key Pair (Local Machine)
Open your local terminal (not the Google Cloud Console) and run:

```bash
ssh-keygen -t rsa -f ~/.ssh/gcp_key -C "your-username"
```
- Replace `your-username` with the username you want to use (e.g., `legion`).
- Press Enter to accept the default passphrase (or set one if you prefer).

This creates two files:
- `~/.ssh/gcp_key` (Private Key - **Keep this secret!**)
- `~/.ssh/gcp_key.pub` (Public Key - You will upload this to Google Cloud)

## Step 2: Get Your Public Key
Display the public key content:

```bash
cat ~/.ssh/gcp_key.pub
```
Copy the entire output (starts with `ssh-rsa` and ends with `your-username`).

## Step 3: Add Key to Google Cloud VM
1.  Go to the **Google Cloud Console** > **Compute Engine** > **VM instances**.
2.  Click on your instance name (`instance-20241123-093244`).
3.  Click **Edit** at the top.
4.  Scroll down to the **SSH Keys** section.
5.  Click **Add Item**.
6.  Paste your **Public Key** into the box.
7.  Click **Save** at the bottom of the page.

## Step 4: Test Connection
Now try to connect from your local terminal:

```bash
ssh -i ~/.ssh/gcp_key your-username@34.78.56.154
```

## Step 5: Configure `deploy.sh`
Update your `server/deploy.sh` file:

1.  Set `REMOTE_USER="your-username"`
2.  Uncomment and set `KEY_PATH="-i ~/.ssh/gcp_key"`

Now you can run `./server/deploy.sh`!
