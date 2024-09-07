<?php
$target_dir = "img/";  // Store images in "img" folder
$target_file = $target_dir . basename($_FILES["xrayImage"]["name"]);
$uploadOk = 1;
$imageFileType = strtolower(pathinfo($target_file, PATHINFO_EXTENSION));

// Check if image file is an actual image or fake image
if(isset($_POST["submit"])) {
    $check = getimagesize($_FILES["xrayImage"]["tmp_name"]);
    if($check !== false) {
        echo "File is an image - " . $check["mime"] . ".";
        $uploadOk = 1;
    } else {
        echo "File is not an image.";
        $uploadOk = 0;
    }
}

// Check file size and type limits
if ($_FILES["xrayImage"]["size"] > 5000000 || !in_array($imageFileType, ['jpg', 'png', 'jpeg', 'gif'])) {
    echo "Sorry, your file is too large or incorrect file type.";
    $uploadOk = 0;
}

// Attempt to upload file if checks passed
if ($uploadOk && move_uploaded_file($_FILES["xrayImage"]["tmp_name"], $target_file)) {
    echo "The file ". htmlspecialchars(basename($_FILES["xrayImage"]["name"])) . " has been uploaded.";
} else {
    echo "Sorry, there was an error uploading your file.";
}
?>
